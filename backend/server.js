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
const User = require('./models/User');
const testResultRoutes = require('./routes/testResultRoutes');


const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // Tighten in production
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

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('login', (userId) => {
    connectedUsers.set(userId, socket.id);
    io.emit('userStatusChange', { userId, isOnline: true });
    socket.join(userId);
    console.log(`User ${userId} logged in with socket ${socket.id}`);
  });

  socket.on('typing', async ({ senderId, recipientId, groupId }) => {
    try {
      const user = await User.findById(senderId).select('username');
      if (!user) return;
      const username = user.username;
      if (groupId) {
        socket.to(`group_${groupId}`).emit('userTyping', { userId: senderId, username });
      } else if (recipientId) {
        io.to(recipientId).emit('userTyping', { userId: senderId, username }); // Use room
      }
    } catch (error) {
      console.error('Error fetching username:', error);
    }
  });

  socket.on('stopTyping', ({ senderId, recipientId, groupId }) => {
    if (groupId) {
      socket.to(`group_${groupId}`).emit('userStoppedTyping', { userId: senderId });
    } else if (recipientId) {
      io.to(recipientId).emit('userStoppedTyping', { userId: senderId }); // Use room
    }
  });

  socket.on('sendMessage', async (messageData) => {
    console.log('SendMessage received for recipient:', messageData.recipientId);
    try {
      if (messageData.groupId) {
        socket.to(`group_${messageData.groupId}`).emit('newMessage', messageData);
      } else if (messageData.recipientId) {
        io.to(messageData.recipientId).emit('newMessage', messageData); // Use room

        // Notification (assume Notification model exists; add error handling if not)
        try {
          const notification = new Notification({
            recipient: messageData.recipientId,
            sender: messageData.sender._id,
            type: 'message',
            content: 'New message received'
          });
          await notification.save();
          io.to(messageData.recipientId).emit('notification', notification);
        } catch (notifErr) {
          console.error('Notification error:', notifErr);
        }
      }
      socket.emit('messageSent', messageData);
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
        io.to(message.sender.toString()).emit('messageStatusUpdate', { messageId, status: 'delivered' }); // Use room
      }
    } catch (error) {
      console.error('Error marking message as delivered:', error);
    }
  });

  socket.on('messageRead', async ({ messageId, readerId }) => {
    try {
      const message = await Message.findById(messageId);
      if (message && message.status !== 'read') {
        message.status = 'read';
        await message.save();
        io.to(message.sender.toString()).emit('messageStatusUpdate', { messageId, status: 'read' }); // Use room
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  });

  socket.on('disconnect', () => {
    let userId;
    for (const [key, value] of connectedUsers.entries()) {
      if (value === socket.id) {
        userId = key;
        break;
      }
    }
    if (userId) {
      connectedUsers.delete(userId);
      io.emit('userStatusChange', { userId, isOnline: false });
      console.log(`User ${userId} disconnected`);
    }
    console.log('Client disconnected:', socket.id);
  });
});

initializeUsers().catch((err) => console.error('User initialization failed:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});