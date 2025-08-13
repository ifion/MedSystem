// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'doctor', 'patient'], required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  address: { type: String },
  status: { type: String, enum: ['pending', 'active', 'rejected'], default: 'pending' },
  hospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // references an admin user
    required: function () {
      return this.role !== 'admin';
    }
  },
  isOnline: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);