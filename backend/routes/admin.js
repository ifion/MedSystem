const express = require('express');
const router = express.Router();
const { User, Appointment, DoctorProfile, PatientProfile, Diagnosis, Prescription, TestResult } = require('../models');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.get('/pending', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const pendingUsers = await User.find({
      status: 'pending',
      hospital: req.user.id
    }).select('-password');
    res.json(pendingUsers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching pending users' });
  }
});

router.put('/verify/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const user = await User.findOne({ _id: req.params.id, hospital: req.user.id });
    if (!user) {
      return res.status(404).json({ message: 'User not found in your hospital' });
    }
    user.status = status;
    await user.save();
    res.json({ message: `User ${status} successfully` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during verification' });
  }
});

router.get('/doctors', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const doctors = await User.find({
      role: 'doctor',
      status: 'active',
      hospital: req.user.id
    }).select('-password');
    const doctorIds = doctors.map(d => d._id);
    const doctorProfiles = await DoctorProfile.find({ doctorId: { $in: doctorIds } });
    const result = doctors.map(doctor => {
      const profile = doctorProfiles.find(p => p.doctorId.toString() === doctor._id.toString());
      return { user: doctor, profile: profile || {} };
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching doctors' });
  }
});

router.get('/patients', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const patients = await User.find({
      role: 'patient',
      status: 'active',
      hospital: req.user.id
    }).select('-password');
    const patientIds = patients.map(p => p._id);
    const patientProfiles = await PatientProfile.find({ patientId: { $in: patientIds } });
    const result = patients.map(patient => {
      const profile = patientProfiles.find(pp => pp.patientId.toString() === patient._id.toString());
      return { user: patient, profile: profile || {} };
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching patients' });
  }
});

router.get('/appointment-requests', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const patientIds = (await User.find({ role: 'patient', hospital: req.user.id })).map(p => p._id);
    const appointmentRequests = await Appointment.find({
      doctorId: null,
      patientId: { $in: patientIds },
      status: 'requested'
    }).populate('patientId', 'name');
    res.json(appointmentRequests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching appointment requests' });
  }
});

router.put('/appointments/:id/assign', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { doctorId, dateTime } = req.body;
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment || appointment.status !== 'requested' || appointment.doctorId) {
      return res.status(400).json({ message: 'Invalid appointment request' });
    }
    const doctor = await User.findOne({ _id: doctorId, role: 'doctor', hospital: req.user.id });
    if (!doctor) {
      return res.status(400).json({ message: 'Invalid doctor' });
    }
    appointment.doctorId = doctorId;
    appointment.dateTime = new Date(dateTime);
    appointment.status = 'scheduled';
    await appointment.save();
    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error assigning appointment' });
  }
});

router.get('/appointments', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const doctorIds = (await User.find({ role: 'doctor', hospital: req.user.id })).map(d => d._id);
    const patientIds = (await User.find({ role: 'patient', hospital: req.user.id })).map(p => p._id);
    const appointments = await Appointment.find({
      patientId: { $in: patientIds }
    })
      .populate('patientId', 'name')
      .populate('doctorId', 'name');
    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching appointments' });
  }
});

router.delete('/appointments/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    const patient = await User.findOne({ _id: appointment.patientId, hospital: req.user.id });
    if (!patient) {
      return res.status(403).json({ message: 'Not authorized to delete this appointment' });
    }
    await appointment.deleteOne();
    res.json({ message: 'Appointment deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error deleting appointment' });
  }
});

router.get('/diagnoses', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const doctorIds = (await User.find({ role: 'doctor', hospital: req.user.id })).map(d => d._id);
    const patientIds = (await User.find({ role: 'patient', hospital: req.user.id })).map(p => p._id);
    const diagnoses = await Diagnosis.find({
      doctorId: { $in: doctorIds },
      patientId: { $in: patientIds }
    })
      .populate('patientId', 'name')
      .populate('doctorId', 'name');
    res.json(diagnoses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching diagnoses' });
  }
});

router.delete('/diagnoses/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const diagnosis = await Diagnosis.findById(req.params.id);
    if (!diagnosis) {
      return res.status(404).json({ message: 'Diagnosis not found' });
    }
    const doctor = await User.findOne({ _id: diagnosis.doctorId, hospital: req.user.id });
    if (!doctor) {
      return res.status(403).json({ message: 'Not authorized to delete this diagnosis' });
    }
    await diagnosis.deleteOne();
    res.json({ message: 'Diagnosis deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error deleting diagnosis' });
  }
});

router.get('/prescriptions', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const doctorIds = (await User.find({ role: 'doctor', hospital: req.user.id })).map(d => d._id);
    const patientIds = (await User.find({ role: 'patient', hospital: req.user.id })).map(p => p._id);
    const prescriptions = await Prescription.find({
      doctorId: { $in: doctorIds },
      patientId: { $in: patientIds }
    })
      .populate('patientId', 'name')
      .populate('doctorId', 'name');
    res.json(prescriptions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching prescriptions' });
  }
});

router.delete('/prescriptions/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id);
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }
    const doctor = await User.findOne({ _id: prescription.doctorId, hospital: req.user.id });
    if (!doctor) {
      return res.status(403).json({ message: 'Not authorized to delete this prescription' });
    }
    await prescription.deleteOne();
    res.json({ message: 'Prescription deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error deleting prescription' });
  }
});

router.get('/test-results', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const doctorIds = (await User.find({ role: 'doctor', hospital: req.user.id })).map(d => d._id);
    const patientIds = (await User.find({ role: 'patient', hospital: req.user.id })).map(p => p._id);
    const testResults = await TestResult.find({
      doctorId: { $in: doctorIds },
      patientId: { $in: patientIds }
    })
      .populate('patientId', 'name')
      .populate('doctorId', 'name');
    res.json(testResults);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching test results' });
  }
});

router.delete('/test-results/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const testResult = await TestResult.findById(req.params.id);
    if (!testResult) {
      return res.status(404).json({ message: 'Test result not found' });
    }
    const doctor = await User.findOne({ _id: testResult.doctorId, hospital: req.user.id });
    if (!doctor) {
      return res.status(403).json({ message: 'Not authorized to delete this test result' });
    }
    await testResult.deleteOne();
    res.json({ message: 'Test result deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error deleting test result' });
  }
});

router.put('/users/:id/suspend', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, hospital: req.user.id });
    if (!user) {
      return res.status(404).json({ message: 'User not found in your hospital' });
    }
    user.status = 'pending';
    await user.save();
    res.json({ message: 'User suspended successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during suspension' });
  }
});

router.delete('/users/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, hospital: req.user.id });
    if (!user) {
      return res.status(404).json({ message: 'User not found in your hospital' });
    }
    // Delete related profile
    if (user.role === 'doctor') {
      await DoctorProfile.deleteOne({ doctorId: user._id });
    } else if (user.role === 'patient') {
      await PatientProfile.deleteOne({ patientId: user._id });
    }
    // Note: In production, cascade delete appointments, diagnoses, etc.
    await user.deleteOne();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error deleting user' });
  }
});

router.get('/hospitals', async (req, res) => {
  try {
    const hospitals = await User.find({ role: 'admin', status: 'active' })
      .select('_id name email');
    res.json(hospitals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching hospitals' });
  }
});

router.get('/doctors/:id/profile', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const profile = await DoctorProfile.findOne({ doctorId: req.params.id })
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

// New route for viewing patient profile (view-only for admin)
router.get('/patients/:id/profile', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const profile = await PatientProfile.findOne({ patientId: req.params.id })
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


module.exports = router;