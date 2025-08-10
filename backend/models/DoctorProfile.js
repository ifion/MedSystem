const mongoose = require('mongoose');

const doctorProfileSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  specialization: { type: String },
  licenseNumber: { type: String },
  yearsOfExperience: { type: Number },
  education: [{
    degree: String,
    institution: String,
    year: Number
  }],
  certifications: [{ type: String }],
  identityCard: { type: String }, // URL to the identity card image stored in Cloudinary
  profilePicture: { type: String } // New field for profile picture
}, { timestamps: true });

module.exports = mongoose.model('DoctorProfile', doctorProfileSchema);
