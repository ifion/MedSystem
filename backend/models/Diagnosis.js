const mongoose = require('mongoose');

const diagnosisSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now, required: true },
  condition: { type: String, required: true },
  description: { type: String },
  treatment: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Diagnosis', diagnosisSchema);