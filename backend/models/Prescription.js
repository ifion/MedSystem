const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now, required: true },
  medication: { type: String, required: true },
  dosage: { type: String },
  duration: { type: String },
  instructions: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Prescription', prescriptionSchema);