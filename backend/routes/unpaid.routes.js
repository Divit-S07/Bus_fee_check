const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  getUnpaidTravels,
  resolveUnpaid,
  getRepeatOffenders
} = require('../controllers/unpaid.controller');

const router = express.Router();
router.use(authenticate);
router.get('/', getUnpaidTravels);
router.get('/repeat-offenders', getRepeatOffenders);
router.put('/:id/resolve', requireRole(['super_admin', 'admin']), resolveUnpaid);
module.exports = router;