const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const Prescription = require('../models/Prescription');

// Create prescription (doctor only)
router.post('/', authenticate, authorize(['doctor']), async (req, res) => {
  try {
    const { patientId, medication, dosage, duration, instructions } = req.body;
    const prescription = new Prescription({
      patientId,
      doctorId: req.user.id,
      medication,
      dosage,
      duration,
      instructions
    });
    await prescription.save();
    res.status(201).json(prescription);
  } catch (err) {
    console.error('Error creating prescription:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get prescriptions for a patient (doctor or admin)
router.get('/patient/:patientId', authenticate, authorize(['doctor', 'admin']), async (req, res) => {
  try {
    const prescriptions = await Prescription.find({ patientId: req.params.patientId })
      .populate('doctorId', 'name')
      .sort({ date: -1 });
    res.json(prescriptions);
  } catch (err) {
    console.error('Error fetching prescriptions:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;