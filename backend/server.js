// Merged server.js with multi-socket support, room-based chat, and concurrent 1:1 video calls
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const doctorRoutes = require('./routes/doctorRoutes');
const patientRoutes = require('./routes/patientRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const diagnosisRoutes = require('./routes/diagnosisRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const messagesRoutes = require('./routes/messageRoutes');
const testResultRoutes = require('./routes/testResultRoutes');

const cloudinary = require('cloudinary').v2;
const initializeUsers = require('./utils/initializeUsers');
const socketIo = require('socket.io');

const Message = require('./models/Message');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST'],
  }
});

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Express middleware
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

// DB
connectDB();

// REST routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/test-results', testResultRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

// ------- Socket state -------
const connectedUsers = new Map(); // userId => Set<socket.id>
const rooms = new Map();          // roomId => Set<socket.id>
app.set('io', io);
app.set('connectedUsers', connectedUsers);

// ------- Socket.IO auth middleware -------
io.use((socket, next) => {
  const userId = socket.handshake.query.userId;
  if (!userId) {
    console.error('Connection rejected: No userId provided in query.');
    return next(new Error('Authentication error: No userId provided.'));
  }
  socket.userId = String(userId);
  next();
});

// ------- Socket.IO main -------
io.on('connection', async (socket) => {
  const userId = socket.userId;
  const recipientId = socket.handshake.query.recipientId ? String(socket.handshake.query.recipientId) : null;
  console.log(`[IO] connected socket=${socket.id} user=${userId} recipient=${recipientId || '-'}`);

  // Derive roomId if recipientId is provided for 1:1 chat (text chat)
  if (recipientId) {
    const chatRoomId = [userId, recipientId].sort().join('_');
    socket.join(chatRoomId);
  }

  // Register user with multi-socket support
  if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
  connectedUsers.get(userId).add(socket.id);

  // First socket online -> mark user online
  if (connectedUsers.get(userId).size === 1) {
    try {
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit('userStatusChange', { userId, isOnline: true });
    } catch (err) {
      console.error('Error updating online status:', err);
    }
  }

  // ---------- MESSAGING ----------
  socket.on('typing', async ({ senderId, recipientId }) => {
    try {
      const typingRoomId = [String(senderId), String(recipientId)].sort().join('_');
      const username = (await User.findById(senderId).select('username'))?.username;
      if (!username) return;
      socket.to(typingRoomId).emit('userTyping', { userId: String(senderId), username });
    } catch (error) {
      console.error('Error fetching username:', error);
    }
  });

  socket.on('stopTyping', ({ senderId, recipientId }) => {
    const typingRoomId = [String(senderId), String(recipientId)].sort().join('_');
    socket.to(typingRoomId).emit('userStoppedTyping', { userId: String(senderId) });
  });

  socket.on('sendMessage', async (messageData, callback) => {
    try {
      const messageRoomId = [
        String(messageData.sender?._id || messageData.sender),
        String(messageData.recipientId)
      ].sort().join('_');

      io.to(messageRoomId).emit('newMessage', messageData);
      socket.emit('messageSent', messageData);
      if (callback) callback({ status: 'sent' });
    } catch (error) {
      console.error('SendMessage error:', error);
      socket.emit('messageError', { messageId: messageData._id, error: 'Failed to deliver message' });
      if (callback) callback({ status: 'failed' });
    }
  });

  socket.on('messageDelivered', async ({ messageId }) => {
    try {
      const message = await Message.findById(messageId);
      if (message && message.status === 'sent') {
        message.status = 'delivered';
        await message.save();
        const senderId = message.sender.toString();
        const senderSockets = connectedUsers.get(senderId) || [];
        for (const sid of senderSockets) {
          io.to(sid).emit('messageStatusUpdate', { messageId, status: 'delivered' });
        }
      }
    } catch (error) {
      console.error('Error marking message as delivered:', error);
    }
  });

  socket.on('messageRead', async ({ messageId }) => {
    try {
      const message = await Message.findById(messageId);
      if (message && message.status !== 'read') {
        message.status = 'read';
        await message.save();
        const senderId = message.sender.toString();
        const senderSockets = connectedUsers.get(senderId) || [];
        for (const sid of senderSockets) {
          io.to(sid).emit('messageStatusUpdate', { messageId, status: 'read' });
        }
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  });

  // ---------- VIDEO CALL SIGNALING (socket.id-precise) ----------
  // 1) Caller rings recipient (by userId). Include roomId and the caller's socket.id.
  socket.on('video_call_request', ({ callerId, recipientId }, cb) => {
    const cid = String(callerId);
    const rid = String(recipientId);
    const callRoomId = [cid, rid].sort().join('_');
    const recipientSockets = connectedUsers.get(rid) || [];
    console.log(`[CALL] request ${cid} -> ${rid} room=${callRoomId}`);

    for (const sid of recipientSockets) {
      io.to(sid).emit('incoming_video_call', {
        callerId: cid,
        callerSocketId: socket.id,
        roomId: callRoomId,
      });
    }
    cb && cb({ status: 'requested', roomId: callRoomId });
  });

  // 2) Recipient accepts; notify the exact caller socket by id.
  socket.on('video_call_accept', ({ callerSocketId, roomId }) => {
    console.log(`[CALL] accept room=${roomId} notify callerSocketId=${callerSocketId}`);
    io.to(callerSocketId).emit('video_call_accepted', { roomId });
  });

  // 3) Recipient rejects; notify exact caller socket by id.
  socket.on('video_call_reject', ({ callerSocketId }) => {
    console.log(`[CALL] reject notify callerSocketId=${callerSocketId}`);
    io.to(callerSocketId).emit('video_call_rejected');
  });

  // 4) Caller cancels before pickup; notify all recipient sockets.
  socket.on('video_call_cancel', ({ recipientId }) => {
    const rid = String(recipientId);
    console.log(`[CALL] cancel -> ${rid}`);
    const recipientSockets = connectedUsers.get(rid) || [];
    for (const sid of recipientSockets) io.to(sid).emit('video_call_canceled');
  });

  // 5) Join WebRTC room (by roomId). Send existing socket ids to the new joiner to initiate offers.
  socket.on('join_video_room', (roomId) => {
    console.log(`[ROOM] ${socket.id} join ${roomId}`);
    socket.join(roomId);
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    const set = rooms.get(roomId);
    set.add(socket.id);

    const others = Array.from(set).filter((id) => id !== socket.id);
    socket.emit('all_users', others); // only to the new joiner
  });

  // 6) Low-level WebRTC signaling by socket.id (simple-peer)
  socket.on('sending_signal', ({ userToSignal, signal }) => {
    // userToSignal is the target socket.id
    io.to(userToSignal).emit('user_joined', { signal, callerId: socket.id });
  });

  socket.on('returning_signal', ({ signal, callerId }) => {
    // callerId is the original initiator's socket.id
    io.to(callerId).emit('receiving_returned_signal', { signal, id: socket.id });
  });

  // 7) End call for everyone in the room
  socket.on('end_call', (roomId) => {
    console.log(`[CALL] end ${roomId}`);
    io.in(roomId).emit('call_ended');
  });

  // ---------- DISCONNECT ----------
  socket.on('disconnect', async () => {
    console.log(`[IO] disconnected socket=${socket.id} user=${userId}`);

    // remove from user map
    const set = connectedUsers.get(userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        connectedUsers.delete(userId);
        try {
          await User.findByIdAndUpdate(userId, { isOnline: false });
          io.emit('userStatusChange', { userId, isOnline: false });
        } catch (err) {
          console.error('Error updating offline status:', err);
        }
        console.log(`User ${userId} disconnected and went offline`);
      }
    }

    // Clean up video call rooms
    rooms.forEach((value, key) => {
      if (value.has(socket.id)) {
        value.delete(socket.id);
        if (value.size === 0) {
          rooms.delete(key);
        } else {
          io.in(key).emit('user_left', socket.id);
        }
      }
    });
  });
});

// Initialize default users
initializeUsers().catch((err) => console.error('User initialization failed:', err));

// Start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
