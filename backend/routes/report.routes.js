const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getDailyReport, getWeeklyReport, getMonthlyReport } = require('../controllers/report.controller');

const router = express.Router();
router.use(authenticate);
router.get('/daily', getDailyReport);
router.get('/weekly', getWeeklyReport);
router.get('/monthly', getMonthlyReport);
module.exports = router;