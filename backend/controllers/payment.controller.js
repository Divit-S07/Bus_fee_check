const FeePayment = require('../models/FeePayment');
const { FeeService } = require('../services/fee.service');

exports.getAllPayments = async (req, res) => {
  const payments = await FeePayment.find().populate('studentId', 'firstName lastName studentId');
  res.json(payments);
};
exports.getPaymentById = async (req, res) => {
  const payment = await FeePayment.findById(req.params.id).populate('studentId');
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  res.json(payment);
};
exports.createPayment = async (req, res) => {
  req.body.createdBy = req.user._id;
  const payment = new FeePayment(req.body);
  await payment.save();
  res.status(201).json(payment);
};
exports.updatePayment = async (req, res) => {
  const payment = await FeePayment.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(payment);
};
exports.deletePayment = async (req, res) => {
  await FeePayment.findByIdAndDelete(req.params.id);
  res.json({ message: 'Payment deleted' });
};
exports.getStudentFeeStatus = async (req, res) => {
  const status = await FeeService.getCurrentFeeStatus(req.params.studentId);
  res.json(status);
};