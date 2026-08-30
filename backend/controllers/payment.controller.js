const FeePayment = require('../models/FeePayment');
const { FeeService } = require('../services/fee.service');

// Get all payments
exports.getAllPayments = async (req, res) => {
  try {
    const payments = await FeePayment.find().populate('studentId', 'firstName lastName studentId');
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get payment by ID
exports.getPaymentById = async (req, res) => {
  try {
    const payment = await FeePayment.findById(req.params.id).populate('studentId');
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create payment
exports.createPayment = async (req, res) => {
  try {
    req.body.createdBy = req.user._id;
    const payment = new FeePayment(req.body);
    await payment.save();
    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update payment
exports.updatePayment = async (req, res) => {
  try {
    const payment = await FeePayment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete payment
exports.deletePayment = async (req, res) => {
  try {
    const payment = await FeePayment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json({ message: 'Payment deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get student fee status
exports.getStudentFeeStatus = async (req, res) => {
  try {
    const status = await FeeService.getCurrentFeeStatus(req.params.studentId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};