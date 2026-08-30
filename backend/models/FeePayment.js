const mongoose = require('mongoose');

const FeePaymentSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['USD', 'INR', 'EUR'], default: 'INR' },
    paymentMethod: { type: String, enum: ['cash', 'card', 'bank_transfer', 'online'], required: true },
    transactionId: { type: String, required: true },
    paymentDate: { type: Date, required: true },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true, index: true },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    isActive: { type: Boolean, default: true },
    notes: { type: String },
    receiptUrl: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FeePayment', FeePaymentSchema);