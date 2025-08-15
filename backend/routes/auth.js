const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, DoctorProfile, PatientProfile } = require('../models');
const upload = require('../middleware/upload');
const authenticate = require('../middleware/authenticate');

router.post('/register', upload.fields([
  { name: 'identityCard', maxCount: 1 },
  { name: 'profilePicture', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      username, password, role, name, email, phone, address,
      specialization, licenseNumber, yearsOfExperience,
      dateOfBirth, hospital, gender
    } = req.body;

    if (role === 'admin') {
      return res.status(403).json({ message: 'Admin registration not allowed' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      password: hashedPassword,
      role,
      name,
      email,
      phone,
      hospital,
      address,
      status: 'pending',
    });
    await user.save();

    const identityCardFile = req.files['identityCard']?.[0];
    const profilePictureFile = req.files['profilePicture']?.[0];

    if (role === 'doctor') {
      if (!identityCardFile) {
        return res.status(400).json({ message: 'Identity card required for doctors' });
      }

      const doctorProfile = new DoctorProfile({
        doctorId: user._id,
        specialization,
        licenseNumber,
        yearsOfExperience,
        identityCard: identityCardFile.path,
        profilePicture: profilePictureFile?.path || null,
      });
      await doctorProfile.save();

    } else if (role === 'patient') {
      const patientProfile = new PatientProfile({
        patientId: user._id,
        dateOfBirth,
        gender,
        profilePicture: profilePictureFile?.path || null,
      });
      await patientProfile.save();
    }

    res.status(201).json({ message: 'Registration successful, awaiting admin approval' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});


router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ message: 'Account pending approval' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ message: 'Account rejected by admin' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
   res.json({ token, role: user.role, userId: user._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// GET user by ID with profile details
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch the base user
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let profileData = null;

    if (user.role === 'doctor') {
      profileData = await DoctorProfile.findOne({ doctorId: user._id }).lean();
    } else if (user.role === 'patient') {
      profileData = await PatientProfile.findOne({ patientId: user._id }).lean();
    }

    // Merge base user + profile
    const mergedData = {
      ...user.toObject(),
      profile: profileData || {}
    };

    res.json(mergedData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ message: 'Server error while fetching user data' });
  }
});


module.exports = router;