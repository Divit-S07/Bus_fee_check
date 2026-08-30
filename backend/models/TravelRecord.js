const mongoose = require('mongoose');

const TravelRecordSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
    recognitionLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'FaceRecognitionLog', required: true },
    timestamp: { type: Date, required: true, index: true },
    direction: { type: String, enum: ['boarding', 'alighting'], required: true },
    feeStatusAtTime: { type: String, enum: ['paid', 'unpaid', 'expired'], required: true },
    paymentValidUntil: { type: Date },
    isUnpaid: { type: Boolean, required: true },
    unpaidReason: { type: String, enum: ['no_payment', 'payment_expired', 'insufficient_funds'] },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TravelRecord', TravelRecordSchema);