// routes/messages.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const Message = require('../models/Message');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const mediaUpload = require('../middleware/upload');

// Helper function to check if chat is allowed (only on appointment days)
async function canChat(userId1, userId2) {
  const today = new Date();
  const start = new Date(today.setHours(0, 0, 0, 0));
  const end = new Date(today.setHours(23, 59, 59, 999));
  const appointment = await Appointment.findOne({
    $or: [
      { patientId: userId1, doctorId: userId2, status: 'confirmed', dateTime: { $gte: start, $lte: end } },
      { patientId: userId2, doctorId: userId1, status: 'confirmed', dateTime: { $gte: start, $lte: end } },
    ],
  });
  return !!appointment;
}

// GET /api/messages/:userId - Get messages between current user and specified user
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const messages = await Message.find({
      $or: [
        { sender: req.user.id, recipient: userId },
        { sender: userId, recipient: req.user.id },
      ],
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'name _id')
      .populate('recipient', 'name _id')
      .populate('replyTo', 'content _id');
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/messages - Send a new message (with media upload support)
router.post('/', authenticate, mediaUpload.single('media'), async (req, res) => {
  try {
    const { recipientId, content, replyTo, disappearAfter, clientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient ID is required' });
    }
    if (!await canChat(req.user.id, recipientId)) {
      return res.status(403).json({ message: 'Chat is only allowed on appointment days' });
    }
    let mediaType;
    if (req.file) {
      if (req.file.mimetype.startsWith('image/')) mediaType = 'image';
      else if (req.file.mimetype.startsWith('audio/')) mediaType = 'audio';
      else mediaType = 'file';
    }
    const message = new Message({
      sender: req.user.id,
      recipient: recipientId,
      content,
      mediaUrl: req.file ? req.file.path : undefined,
      mediaType,
      fileName: req.file ? req.file.originalname : undefined,
      replyTo,
      disappearAfter: disappearAfter ? parseInt(disappearAfter, 10) : 0,
      clientId,
      status: 'sent',
    });
    await message.save();
    await message.populate('sender', 'name _id');
    await message.populate('recipient', 'name _id');
    await message.populate('replyTo', 'content _id');
    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/messages/resend/:id - Resend a failed message
router.post('/resend/:id', authenticate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message || message.sender.toString() !== req.user.id || message.status !== 'failed') {
      return res.status(404).json({ message: 'Message not found, not failed, or unauthorized' });
    }
    if (!await canChat(req.user.id, message.recipient.toString())) {
      return res.status(403).json({ message: 'Chat is only allowed on appointment days' });
    }
    message.status = 'sent';
    await message.save();
    await message.populate('sender', 'name _id');
    await message.populate('recipient', 'name _id');
    await message.populate('replyTo', 'content _id');
    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/messages/:id - Soft delete a message
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message || message.sender.toString() !== req.user.id) {
      return res.status(404).json({ message: 'Message not found or unauthorized' });
    }
    message.isDeleted = true;
    await message.save();
    res.json({ message: 'Message deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/messages/:id - Edit a message
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ message: 'Content is required for edit' });
    }
    const message = await Message.findById(req.params.id);
    if (!message || message.sender.toString() !== req.user.id) {
      return res.status(404).json({ message: 'Message not found or unauthorized' });
    }
    message.content = content;
    message.isEdited = true;
    await message.save();
    await message.populate('sender', 'name _id');
    await message.populate('recipient', 'name _id');
    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/messages/restore/:id - Undo delete (restore message)
router.put('/restore/:id', authenticate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message || message.sender.toString() !== req.user.id) {
      return res.status(404).json({ message: 'Message not found or unauthorized' });
    }
    message.isDeleted = false;
    await message.save();
    await message.populate('sender', 'name _id');
    await message.populate('recipient', 'name _id');
    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;