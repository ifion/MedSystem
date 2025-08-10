const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dateTime: { type: Date },
  status: { 
    type: String, 
    enum: ['requested', 'scheduled', 'confirmed', 'rejected', 'completed', 'canceled'], 
    default: 'requested' 
  },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorCompleted: { type: Boolean, default: false },
  patientCompleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Appointment', appointmentSchema);