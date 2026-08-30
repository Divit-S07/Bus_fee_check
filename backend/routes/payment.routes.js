const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  getAllPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  getStudentFeeStatus
} = require('../controllers/payment.controller');

const router = express.Router();
router.use(authenticate);
router.get('/', getAllPayments);
router.get('/:id', getPaymentById);
router.post('/', requireRole(['super_admin', 'admin']), createPayment);
router.put('/:id', requireRole(['super_admin', 'admin']), updatePayment);
router.delete('/:id', requireRole(['super_admin']), deletePayment);
router.get('/student/:studentId/status', getStudentFeeStatus);
module.exports = router;