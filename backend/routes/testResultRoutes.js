// Updated testResultRoutes.js
const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const TestResult = require('../models/TestResult');
const testUpload = require('../middleware/upload');
const auth = require('../middleware/authenticate');
const auths = require('../middleware/authorize');


// Suggest test (doctor only)
const suggestTest = async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { patientId, testType, notes } = req.body;
  try {
    const test = new TestResult({
      patientId,
      doctorId: req.user.id,
      testType,
      notes,
      date: new Date(),
      results: null
    });
    await test.save();
    res.status(201).json(test);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Upload result (patient only)
const uploadResult = async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { testId } = req.params;
  try {
    const test = await TestResult.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }
    if (test.patientId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not your test' });
    }
    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path);
      test.results = uploadResult.secure_url;
      fs.unlinkSync(req.file.path); // Delete local file after upload
      await test.save();
      res.json(test);
    } else {
      res.status(400).json({ message: 'No file uploaded' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update notes (doctor only)
const updateNotes = async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { testId } = req.params;
  const { notes } = req.body;
  try {
    const test = await TestResult.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }
    if (test.doctorId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not your test' });
    }
    test.notes = notes;
    await test.save();
    res.json(test);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get test results for a patient (accessible by doctor/patient with patientId)
const getForPatient = async (req, res) => {
  const { patientId } = req.params;
  try {
    if (req.user.role === 'patient' && req.user.id !== patientId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    // For doctors, allow access (assume association via hospital or similar; simplify here)
    const tests = await TestResult.find({ patientId }).populate('doctorId', 'name');
    res.json(tests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get my test results (patient only)
const getMyTestResults = async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const tests = await TestResult.find({ patientId: req.user.id }).populate('doctorId', 'name');
    res.json(tests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

router.post('/suggest', auth, auths(['doctor']), suggestTest); 
router.post('/upload/:testId', auth, auths(['patient']), testUpload.single('result'), uploadResult);
router.put('/:testId/notes', auth, auths(['doctor']), updateNotes); 
router.get('/patient/:patientId', auth, auths(['doctor', 'patient']), getForPatient);
router.get('/my', auth, auths(['patient']), getMyTestResults);

module.exports = router;