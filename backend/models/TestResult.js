const mongoose = require('mongoose');

const testResultSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  testType: { type: String, required: true },
  date: { type: Date, required: true },
  results: { type: String },
  notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('TestResult', testResultSchema);