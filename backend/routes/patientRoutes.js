const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const PatientProfile = require('../models/PatientProfile');
const { User, Appointment, TestResult, Diagnosis, Prescription } = require('../models');
const auth = require('../middleware/patientauth');
const upload = require('../middleware/upload');

router.get('/profile', auth, async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const profile = await PatientProfile.findOne({ patientId: req.user._id })
      .populate('patientId', 'name email phone address');
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
    if (req.user.role !== 'patient') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const { profile } = req.body;
    const profileData = JSON.parse(profile);

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path);
      profileData.profilePicture = result.secure_url;
    }

    const updatedProfile = await PatientProfile.findOneAndUpdate(
      { patientId: req.user._id },
      profileData,
      { new: true, upsert: true }
    ).populate('patientId', 'name email phone address');

    res.json(updatedProfile);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/appointments/request', auth, async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const { notes } = req.body;
    const appointment = new Appointment({
      patientId: req.user._id,
      status: 'requested',
      notes,
      createdBy: req.user._id,
    });
    await appointment.save();
    res.status(201).json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error creating appointment' });
  }
});

router.put('/appointments/:id/complete', auth, async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment || appointment.patientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (appointment.status !== 'confirmed') {
      return res.status(400).json({ message: 'Appointment is not confirmed' });
    }
    if (new Date() < new Date(appointment.dateTime)) {
      return res.status(400).json({ message: 'Cannot complete before scheduled date' });
    }
    appointment.patientCompleted = true;
    if (appointment.doctorCompleted && appointment.patientCompleted) {
      appointment.status = 'completed';
    }
    await appointment.save();
    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/test-results', auth, async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const testResults = await TestResult.find({ patientId: req.user._id })
      .populate('doctorId', 'name');
    res.json(testResults);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching test results' });
  }
});

router.get('/diagnoses', auth, async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const diagnoses = await Diagnosis.find({ patientId: req.user._id })
      .populate('doctorId', 'name');
    res.json(diagnoses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching diagnoses' });
  }
});

router.get('/prescriptions', auth, async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const prescriptions = await Prescription.find({ patientId: req.user._id })
      .populate('doctorId', 'name');
    res.json(prescriptions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching prescriptions' });
  }
});

router.get('/appointments', auth, async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const appointments = await Appointment.find({ patientId: req.user._id })
      .populate('doctorId', 'name')
      .sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching appointments' });
  }
});

module.exports = router;