const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  getBusUnpaidTracking,
  getBusUnpaidSummary,
  getBusUnpaidById,
  resolveBusUnpaid,
  syncUnpaidData,
} = require('../controllers/busUnpaid.controller');

const router = express.Router();

router.use(authenticate);

router.get('/summary', getBusUnpaidSummary);
router.get('/sync', requireRole(['super_admin', 'admin']), syncUnpaidData);
router.get('/', getBusUnpaidTracking);
router.get('/:id', getBusUnpaidById);
router.put('/:id/resolve', requireRole(['super_admin', 'admin', 'operator']), resolveBusUnpaid);

module.exports = router;

