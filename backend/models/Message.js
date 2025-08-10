const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  },
  clientId: { type: String },
  content: {
    type: String,
    required: function() { return !this.mediaUrl && !this.sticker && !this.emoji; }
  },
  mediaUrl: String,
  sticker: String,
  emoji: String,
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  retryCount: {
    type: Number,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  readAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  disappearAfter: {
    type: Number,
    default: 0
  }
});

MessageSchema.pre('validate', function(next) {
  if (this.recipient && this.group) {
    next(new Error('Message cannot have both recipient and group'));
  }
  if (!this.recipient && !this.group) {
    next(new Error('Message must have either recipient or group'));
  }
  next();
});


module.exports = mongoose.model('Message', MessageSchema);