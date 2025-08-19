require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const cloudinary = require('cloudinary').v2;
const initializeUsers = require('./utils/initializeUsers');
const Message = require('./models/Message');
const User = require('./models/User');

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const doctorRoutes = require('./routes/doctorRoutes');
const patientRoutes = require('./routes/patientRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const diagnosisRoutes = require('./routes/diagnosisRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const messagesRoutes = require('./routes/messageRoutes');
const testResultRoutes = require('./routes/testResultRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
  },
});

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      retryWrites: true,
      retryReads: true,
    });
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
    setTimeout(connectDB, 5000);
  });

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err);
  });
};

// Connect to MongoDB
connectDB();

// Express Middleware
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

// REST Routes
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

// Socket State
const connectedUsers = new Map(); // userId => Set<socket.id>
const rooms = new Map(); // roomId => Set<socket.id>
app.set('io', io);
app.set('connectedUsers', connectedUsers);

// Socket.IO Auth Middleware
io.use((socket, next) => {
  const userId = socket.handshake.query.userId;
  if (!userId) {
    console.error('Connection rejected: No userId provided.');
    return next(new Error('Authentication error: No userId provided.'));
  }
  socket.userId = String(userId);
  next();
});

io.on('connection', async (socket) => {
  const userId = socket.userId;
  const recipientId = socket.handshake.query.recipientId ? String(socket.handshake.query.recipientId) : null;
  console.log(`[IO] connected socket=${socket.id} user=${userId} recipient=${recipientId || '-'}`);

  // If they connected with a recipient param, join the private chat room (optional)
  if (recipientId) {
    const chatRoomId = [userId, recipientId].sort().join('_');
    socket.join(chatRoomId);
  }

  if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
  connectedUsers.get(userId).add(socket.id);

  // update online status once per-user when they first connect
  if (connectedUsers.get(userId).size === 1) {
    try {
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit('userStatusChange', { userId, isOnline: true });
    } catch (err) {
      console.error('Error updating online status:', err);
    }
  }

  socket.on('typing', async ({ senderId, recipientId }) => {
    try {
      const typingRoomId = [String(senderId), String(recipientId)].sort().join('_');
      const username = (await User.findById(senderId).select('username'))?.username;
      if (username) {
        socket.to(typingRoomId).emit('userTyping', { userId: String(senderId), username });
      }
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
        String(messageData.recipientId),
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

  // --- Video call flow ---------------------------------------------------

  socket.on('video_call_request', ({ callerId, recipientId, roomId }, cb) => {
    try {
      const cid = String(callerId);
      const rid = String(recipientId);
      console.log(`[CALL] request ${cid} -> ${rid} room=${roomId}`);
      const recipientSockets = connectedUsers.get(rid) || [];
      for (const sid of recipientSockets) {
        io.to(sid).emit('incoming_video_call', {
          callerId: cid,
          callerSocketId: socket.id,
          roomId,
        });
      }
      if (cb) cb({ status: 'requested', roomId });
    } catch (err) {
      console.error('video_call_request error:', err);
      if (cb) cb({ status: 'error' });
    }
  });

  socket.on('video_call_accept', ({ callerSocketId, roomId }) => {
    try {
      console.log(`[CALL] accept room=${roomId} notify callerSocketId=${callerSocketId}`);
      socket.join(roomId);
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId).add(socket.id);
      // notify caller to join + start establishing peers
      io.to(callerSocketId).emit('video_call_accepted', { roomId });
    } catch (err) {
      console.error('video_call_accept error:', err);
    }
  });

  socket.on('video_call_reject', ({ callerSocketId }) => {
    try {
      console.log(`[CALL] reject notify callerSocketId=${callerSocketId}`);
      io.to(callerSocketId).emit('video_call_rejected');
    } catch (err) {
      console.error('video_call_reject error:', err);
    }
  });

  socket.on('video_call_cancel', ({ recipientId }) => {
    try {
      const rid = String(recipientId);
      console.log(`[CALL] cancel -> ${rid}`);
      const recipientSockets = connectedUsers.get(rid) || [];
      for (const sid of recipientSockets) io.to(sid).emit('video_call_canceled');
    } catch (err) {
      console.error('video_call_cancel error:', err);
    }
  });

  socket.on('join_video_room', (roomId) => {
    try {
      if (!roomId) return;
      console.log(`[ROOM] ${socket.id} join ${roomId}`);
      socket.join(roomId);
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      const set = rooms.get(roomId);
      set.add(socket.id);
      const others = Array.from(set).filter((id) => id !== socket.id);
      // send the list of other socket ids in the room so client can create peers
      socket.emit('all_users', others);
    } catch (err) {
      console.error('join_video_room error:', err);
    }
  });

  socket.on('sending_signal', ({ userToSignal, signal }) => {
    try {
      // userToSignal should be a socket id (from join_video_room/all_users)
      if (userToSignal) {
        io.to(userToSignal).emit('user_joined', { signal, callerId: socket.id });
      }
    } catch (err) {
      console.error('sending_signal error:', err);
    }
  });

  socket.on('returning_signal', ({ signal, callerId }) => {
    try {
      if (callerId) {
        io.to(callerId).emit('receiving_returned_signal', { signal, id: socket.id });
      }
    } catch (err) {
      console.error('returning_signal error:', err);
    }
  });

  socket.on('end_call', (roomId) => {
    try {
      if (!roomId) return;
      console.log(`[CALL] end ${roomId}`);
      io.in(roomId).emit('call_ended');
      // cleanup room state
      rooms.delete(roomId);
    } catch (err) {
      console.error('end_call error:', err);
    }
  });

  // graceful disconnect
  socket.on('disconnect', async () => {
    try {
      console.log(`[IO] disconnected socket=${socket.id} user=${userId}`);
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
        }
      }

      // remove socket from any rooms and notify participants
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
    } catch (err) {
      console.error('disconnect handler error:', err);
    }
  });
});

// Initialize default users
initializeUsers().catch((err) => console.error('User initialization failed:', err));

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
