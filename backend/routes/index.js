const express = require('express');
const authRoutes = require('./auth.routes');
const studentRoutes = require('./student.routes');
const busRoutes = require('./bus.routes');
const paymentRoutes = require('./payment.routes');
const travelRoutes = require('./travel.routes');
const unpaidRoutes = require('./unpaid.routes');
const reportRoutes = require('./report.routes');
const webhookRoutes = require('./webhook.routes');
const analyticsRoutes = require('./analytics.routes');

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/buses', busRoutes);
router.use('/payments', paymentRoutes);
router.use('/travel', travelRoutes);
router.use('/unpaid', unpaidRoutes);
router.use('/reports', reportRoutes);
router.use('/webhook', webhookRoutes);
router.use('/analytics', analyticsRoutes);

module.exports = router;