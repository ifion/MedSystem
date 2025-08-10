const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const Diagnosis = require('../models/Diagnosis');

// Create diagnosis (doctor only)
router.post('/', authenticate, authorize(['doctor']), async (req, res) => {
  try {
    const { patientId, condition, description, treatment } = req.body;
    const diagnosis = new Diagnosis({
      patientId,
      doctorId: req.user.id,
      condition,
      description,
      treatment
    });
    await diagnosis.save();
    res.status(201).json(diagnosis);
  } catch (err) {
    console.error('Error creating diagnosis:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get diagnoses for a patient (doctor or admin)
router.get('/patient/:patientId', authenticate, authorize(['doctor', 'admin']), async (req, res) => {
  try {
    const diagnoses = await Diagnosis.find({ patientId: req.params.patientId })
      .populate('doctorId', 'name')
      .sort({ date: -1 });
    res.json(diagnoses);
  } catch (err) {
    console.error('Error fetching diagnoses:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;