// routes/appointments.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const Appointment = require('../models/Appointment');

router.get('/check-chat/:otherUserId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const otherUserId = req.params.otherUserId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointments = await Appointment.find({
      status: 'confirmed',
      dateTime: { $gte: today, $lt: tomorrow },
      $or: [
        { doctorId: userId, patientId: otherUserId },
        { doctorId: otherUserId, patientId: userId }
      ]
    });

    res.json({ canChat: appointments.length > 0 });
  } catch (err) {
    console.error('Error checking chat permission:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;