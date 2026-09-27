const mongoose = require('mongoose');

const FeeReceiptSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    studentMatched: { type: Boolean, default: false },
    matchMethod: { type: String },
    receiptNumber: { type: String },
    amount: { type: Number },
    receiptDate: { type: Date },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    mimeType: { type: String },
    ocrText: { type: String },
    parsed: {
      name: String,
      studentId: String,
      rollnumber: String,
      email: String,
      phone: String,
      program: String,
      batch: String,
    },
    status: {
      type: String,
      enum: ['matched', 'created', 'unmatched', 'error'],
      default: 'unmatched',
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FeeReceipt', FeeReceiptSchema);
