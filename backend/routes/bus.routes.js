const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  getAllBuses,
  getBusById,
  createBus,
  updateBus,
  deleteBus
} = require('../controllers/bus.controller');

const router = express.Router();
router.use(authenticate);
router.get('/', getAllBuses);
router.get('/:id', getBusById);
router.post('/', requireRole(['super_admin', 'admin']), createBus);
router.put('/:id', requireRole(['super_admin', 'admin']), updateBus);
router.delete('/:id', requireRole(['super_admin']), deleteBus);
module.exports = router;