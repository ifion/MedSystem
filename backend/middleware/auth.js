// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const dotenv = require('dotenv');

dotenv.config();

module.exports = async function (req, res, next) {
  // Get token from Authorization header
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user (to ensure they still exist and are active)
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ msg: 'User not found or unauthorized' });
    }

    // Optional: block pending/rejected users
    if (user.status !== 'active') {
      return res.status(403).json({ msg: 'Account is not active' });
    }

    // Attach user to request
    req.user = {
      id: user._id.toString(),
      role: user.role,
      hospital: user.hospital,
      name: user.name,
      username: user.username,
      email: user.email
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
