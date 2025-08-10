const mongoose = require('mongoose');

const patientProfileSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateOfBirth: { type: Date },
  gender: { type: String },
  bloodType: { type: String },
  allergies: [{ type: String }],
  medicalHistory: [{
    condition: String,
    date: Date,
    notes: String
  }],
  currentMedications: [{ type: String }],
  insuranceInfo: {
    provider: String,
    policyNumber: String
  },
  emergencyContact: {
    name: String,
    relation: String,
    phone: String
  },
  profilePicture: { type: String } // New field for profile picture
}, { timestamps: true });

module.exports = mongoose.model('PatientProfile', patientProfileSchema);
