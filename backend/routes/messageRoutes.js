const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const Message = require('../models/Message');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const dotenv = require('dotenv');

dotenv.config();
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => ({
    folder: 'uploads/chat',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'webm', 'mp3'],
    public_id: `${Date.now()}-${file.originalname}`,
    resource_type: file.mimetype.startsWith('audio/') ? 'video' : 'auto',
  }),
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'audio/webm', 'audio/mp3'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

router.get('/:userId', authenticate, authorize(['admin', 'doctor', 'patient']), async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user.id, recipient: req.params.userId },
        { sender: req.params.userId, recipient: req.user.id }
      ]
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'name username isOnline')
      .populate('recipient', 'name username isOnline')
      .populate('replyTo', 'content mediaUrl');
    
    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/', authenticate, authorize(['admin', 'doctor', 'patient']), upload.single('media'),
  async (req, res) => {
    try {
      const { recipientId, groupId, content, replyTo, clientId, disappearAfter } = req.body;
      const mediaUrl = req.file ? req.file.path : null;

      if (!content && !mediaUrl) {
        return res.status(400).json({ msg: 'Either text content or a media file is required.' });
      }

      let messageData = {
        sender: req.user.id,
        mediaUrl,
        status: 'sent',
        clientId,
        disappearAfter: disappearAfter ? parseInt(disappearAfter) : 0
      };

      if (content) messageData.content = content;
      if (replyTo) messageData.replyTo = replyTo;

      if (groupId) {
        return res.status(400).json({ msg: 'Group chats are not supported in this context.' });
      } else if (recipientId) {
        messageData.recipient = recipientId;
      } else {
        return res.status(400).json({ msg: 'RecipientId is required' });
      }

      const message = new Message(messageData);
      await message.save();

      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'name username isOnline')
        .populate('recipient', 'name username isOnline')
        .populate('replyTo', 'content mediaUrl');

      // No emits here; handled in server.js 'sendMessage'

      res.json(populatedMessage);

    } catch (err) {
      console.error('Error sending message:', err);
      res.status(500).json({ msg: 'Failed to send message' });
    }
  }
);

router.put('/:messageId', authenticate, authorize(['admin', 'doctor', 'patient']), async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    
    if (!message) {
      return res.status(404).json({ msg: 'Message not found' });
    }

    if (message.sender.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    message.content = req.body.content;
    message.isEdited = true;
    await message.save();

    res.json(message);
  } catch (err) {
    console.error('Error editing message:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.delete('/:messageId', authenticate, authorize(['admin', 'doctor', 'patient']), async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    
    if (!message) {
      return res.status(404).json({ msg: 'Message not found' });
    }

    if (message.sender.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    res.json({ msg: 'Message deleted' });
  } catch (err) {
    console.error('Error deleting message:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.put('/restore/:messageId', authenticate, authorize(['admin', 'doctor', 'patient']), async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ msg: 'Message not found' });
    }

    if (message.sender.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    message.isDeleted = false;
    message.deletedAt = null;
    await message.save();

    res.json(message);
  } catch (err) {
    console.error('Error restoring message:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/:messageId/retry', authenticate, authorize(['admin', 'doctor', 'patient']), async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    
    if (!message) {
      return res.status(404).json({ msg: 'Message not found' });
    }

    if (message.sender.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    if (message.status !== 'failed') {
      return res.status(400).json({ msg: 'Message is not in failed state' });
    }

    message.status = 'sent';
    message.retryCount += 1;
    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name username isOnline')
      .populate('recipient', 'name username isOnline')
      .populate('replyTo', 'content mediaUrl');

    res.json(populatedMessage);
  } catch (err) {
    console.error('Error retrying message:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;