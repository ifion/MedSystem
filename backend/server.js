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
const cloudinary = require('cloudinary').v2;
const initializeUsers = require('./utils/initializeUsers');
const socketIo = require('socket.io');
const Message = require('./models/Message');
const User = require('./models/User');
const testResultRoutes = require('./routes/testResultRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // tighten in production
    methods: ['GET', 'POST']
  }
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(cors());
app.use(express.json());

connectDB();

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

const connectedUsers = new Map();
app.set('io', io);
app.set('connectedUsers', connectedUsers);

const rooms = new Map(); // For video call rooms

// ====================================================================
// START: SOLUTION IMPLEMENTATION
// ====================================================================

// 1. Add middleware to handle authentication on connection
io.use((socket, next) => {
  const userId = socket.handshake.query.userId;
  if (!userId) {
    console.error('Connection rejected: No userId provided in query.');
    return next(new Error('Authentication error: No userId provided.'));
  }
  socket.userId = String(userId); // Attach userId to the socket object
  next();
});

io.on('connection', (socket) => {
  // The 'socket.userId' is now available thanks to the middleware
  const userId = socket.userId;
  console.log(`Client connected: ${socket.id} for user: ${userId}`);

  // 2. Register the user immediately upon connection
  connectedUsers.set(userId, socket.id);
  socket.join(userId);
  io.emit('userStatusChange', { userId, isOnline: true });
  console.log(`User ${userId} is online with socket ${socket.id}`);

  // The 'login' event is no longer needed
  // socket.on('login', ...) // <== REMOVED

  socket.on('typing', async ({ senderId, recipientId }) => {
    try {
      const username = (await User.findById(senderId).select('username'))?.username;
      if (!username) return;
      io.to(String(recipientId)).emit('userTyping', { userId: String(senderId), username });
    } catch (error) {
      console.error('Error fetching username:', error);
    }
  });

  socket.on('stopTyping', ({ senderId, recipientId }) => {
    io.to(String(recipientId)).emit('userStoppedTyping', { userId: String(senderId) });
  });

  socket.on('sendMessage', async (messageData) => {
    try {
      io.to(String(messageData.recipientId)).emit('newMessage', messageData);
      io.to(String(messageData.sender?._id || messageData.sender)).emit('newMessage', messageData);
      socket.emit('messageSent', messageData);
      console.log('mesageSent', messageData);
    } catch (error) {
      console.error('SendMessage error:', error);
      socket.emit('messageError', { messageId: messageData._id, error: 'Failed to deliver message' });
    }
  });

  socket.on('messageDelivered', async ({ messageId }) => {
    try {
      const message = await Message.findById(messageId);
      if (message && message.status === 'sent') {
        message.status = 'delivered';
        await message.save();
        io.to(String(message.sender)).emit('messageStatusUpdate', { messageId, status: 'delivered' });
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
        io.to(String(message.sender)).emit('messageStatusUpdate', { messageId, status: 'read' });
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  });

  // Video call signaling (no changes needed here)
  socket.on('video_call_request', ({ callerId, recipientId }) => {
    const rid = String(recipientId);
    const cid = String(callerId);
    const roomId = [cid, rid].sort().join('_');
    const recipientSocket = connectedUsers.get(rid);
    if (recipientSocket) {
      io.to(recipientSocket).emit('incoming_video_call', { callerId: cid, roomId });
    }
  });

  socket.on('video_call_accept', ({ callerId, roomId }) => {
    const cid = String(callerId);
    const callerSocket = connectedUsers.get(cid);
    if (callerSocket) {
      io.to(callerSocket).emit('video_call_accepted', { roomId });
    }
  });

  socket.on('video_call_reject', ({ callerId }) => {
    const cid = String(callerId);
    const callerSocket = connectedUsers.get(cid);
    if (callerSocket) {
      io.to(callerSocket).emit('video_call_rejected');
    }
  });

  socket.on('video_call_cancel', ({ recipientId }) => {
    const rid = String(recipientId);
    const recipientSocket = connectedUsers.get(rid);
    if (recipientSocket) {
      io.to(recipientSocket).emit('video_call_canceled');
    }
  });

  socket.on('join_video_room', (roomId) => {
    socket.join(roomId);
    if (rooms.has(roomId)) {
      rooms.get(roomId).push(socket.id);
    } else {
      rooms.set(roomId, [socket.id]);
    }
    const otherUsers = rooms.get(roomId).filter(id => id !== socket.id);
    socket.emit('all_users', otherUsers);
  });

  socket.on('sending_signal', (payload) => {
    io.to(payload.userToSignal).emit('user_joined', { signal: payload.signal, callerId: payload.callerId });
  });

  socket.on('returning_signal', (payload) => {
    io.to(payload.callerId).emit('receiving_returned_signal', { signal: payload.signal, id: socket.id });
  });

  socket.on('end_call', (roomId) => {
    socket.to(roomId).emit('call_ended');
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // 3. Simplify the disconnect logic
    if (userId) { // The userId is from the closure of the connection handler
      connectedUsers.delete(userId);
      io.emit('userStatusChange', { userId, isOnline: false });
      console.log(`User ${userId} disconnected and went offline`);
    }

    // Clean up video call rooms
    rooms.forEach((value, key) => {
      if (value.includes(socket.id)) {
        const updatedRoom = value.filter(id => id !== socket.id);
        if (updatedRoom.length === 0) {
          rooms.delete(key);
        } else {
          rooms.set(key, updatedRoom);
          socket.to(key).emit('user_left', socket.id);
        }
      }
    });
  });
});


initializeUsers().catch((err) => console.error('User initialization failed:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});