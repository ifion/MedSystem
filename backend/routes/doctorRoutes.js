const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const DoctorProfile = require('../models/DoctorProfile');
const Appointment = require('../models/Appointment');
const auth = require('../middleware/doctorauth');
const upload = require('../middleware/upload');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.get('/profile', auth, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const profile = await DoctorProfile.findOne({ doctorId: req.user._id })
      .populate('doctorId', 'name email phone address');
    if (!profile) {
      return res.status(404).json({ msg: 'Profile not found' });
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.put('/profile', auth, upload.single('profilePicture'), async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const { profile } = req.body;
    const profileData = JSON.parse(profile);

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path);
      profileData.profilePicture = result.secure_url;
    }

    const updatedProfile = await DoctorProfile.findOneAndUpdate(
      { doctorId: req.user._id },
      profileData,
      { new: true, upsert: true }
    ).populate('doctorId', 'name email phone address');

    res.json(updatedProfile);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/appointments', authenticate, authorize(['doctor']), async (req, res) => {
  try {
    const appointments = await Appointment.find({ doctorId: req.user.id })
      .populate('patientId', 'name')
      .sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching appointments' });
  }
});

router.put('/appointments/:id', authenticate, authorize(['doctor']), async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = {
      'scheduled': ['confirmed', 'rejected'],
      'confirmed': ['completed', 'canceled']
    };
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment || appointment.doctorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this appointment' });
    }
    if (!allowedStatuses[appointment.status] || !allowedStatuses[appointment.status].includes(status)) {
      return res.status(400).json({ message: `Cannot change status from ${appointment.status} to ${status}` });
    }
    if (status === 'completed') {
      if (new Date() < new Date(appointment.dateTime)) {
        return res.status(400).json({ message: 'Cannot complete before scheduled date' });
      }
      appointment.doctorCompleted = true;
      if (appointment.doctorCompleted && appointment.patientCompleted) {
        appointment.status = 'completed';
      } else {
        appointment.status = 'confirmed';
      }
    } else {
      appointment.status = status;
    }
    await appointment.save();
    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error updating appointment' });
  }
});

module.exports = router;