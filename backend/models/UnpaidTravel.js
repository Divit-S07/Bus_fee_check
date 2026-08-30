const mongoose = require('mongoose');

const UnpaidTravelSchema = new mongoose.Schema(
  {
    travelRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'TravelRecord', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
    timestamp: { type: Date, required: true },
    reason: { type: String, enum: ['no_payment', 'payment_expired', 'insufficient_funds', 'invalid_face'], required: true },
    confidenceScore: { type: Number, required: true },
    isRepeatOffense: { type: Boolean, default: false },
    repeatCount: { type: Number, default: 0 },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    resolutionNotes: { type: String },
    notifiedAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UnpaidTravel', UnpaidTravelSchema);