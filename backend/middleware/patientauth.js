const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Auth middleware for patient routes.
 * - Verifies JWT token in Authorization header (Bearer).
 * - Attaches user object to req.user (only if user is a patient and status is active).
 */
module.exports = async function (req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user in DB
    const user = await User.findById(decoded.id);
    if (!user || user.role !== 'patient' || user.status !== 'active') {
      return res.status(403).json({ msg: 'Access denied: not an active patient' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ msg: 'Token is not valid' });
  }
};