// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String },
  mediaUrl: { type: String },
  mediaType: { type: String },
  fileName: { type: String },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  replyContent: { type: String },
  disappearAfter: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
  isEdited: { type: Boolean, default: false },
  status: { type: String, enum: ['sent', 'delivered', 'read', 'failed'], default: 'sent' },
  clientId: { type: String },
  expireAt: { type: Date },
}, { timestamps: true });

messageSchema.pre('save', function(next) {
  if (this.disappearAfter > 0) {
    this.expireAt = new Date(Date.now() + this.disappearAfter * 1000);
  }
  next();
});

messageSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Message', messageSchema);