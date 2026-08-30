const express = require('express');
const { getDashboardStats } = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/dashboard', authenticate, getDashboardStats);

module.exports = router;
