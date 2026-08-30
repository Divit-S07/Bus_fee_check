const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select('-passwordHash -refreshToken');
    if (!admin || !admin.isActive) return res.status(401).json({ message: 'Invalid or inactive admin' });
    req.user = admin;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = { authenticate };