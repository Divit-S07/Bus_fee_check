const mongoose = require('mongoose');

const BusUnpaidTrackingSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    busId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bus',
      required: true,
      index: true,
    },
    busNumber: {
      type: String,
      required: true,
      index: true,
    },
    routeName: {
      type: String,
      default: '',
    },
    studentDetails: {
      studentId: { type: String, required: true, index: true },
      firstName: { type: String, required: true },
      lastName: { type: String, default: '' },
      fullName: { type: String, default: '', index: true },
      department: { type: String, default: '' },
      batch: { type: String, default: '' },
      phonenumber: { type: String, default: '' },
      email: { type: String, default: '' },
      photoUrl: { type: String, default: '' },
    },
    unpaidTripCount: {
      type: Number,
      default: 1,
      min: 1,
      index: true,
    },
    totalUnpaidTripsAcrossBuses: {
      type: Number,
      default: 1,
      min: 1,
    },
    firstTravelDate: {
      type: Date,
      required: true,
    },
    lastTravelDate: {
      type: Date,
      required: true,
      index: true,
    },
    tripHistory: [
      {
        travelRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'TravelRecord' },
        unpaidTravelId: { type: mongoose.Schema.Types.ObjectId, ref: 'UnpaidTravel' },
        timestamp: { type: Date, required: true },
        reason: { type: String, default: 'no_payment' },
        confidenceScore: { type: Number },
      },
    ],
    isRepeatOffender: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ['unresolved', 'resolved', 'in_review'],
      default: 'unresolved',
      index: true,
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolvedAt: {
      type: Date,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    resolutionNotes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Compound index: unique record per student per bus
BusUnpaidTrackingSchema.index({ studentId: 1, busId: 1 }, { unique: true });

module.exports = mongoose.model('BusUnpaidTracking', BusUnpaidTrackingSchema);

