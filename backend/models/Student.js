const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, default: '' },
    email: { type: String },
    phonenumber: { type: String },
    rollnumber: { type: String },
    program: { type: String },
    batch: { type: String },
    busRoute: { type: String },
    transportFee: { type: Number },
    validityPeriod: { type: String },
    boardingPoint: { type: String },
    class: { type: String },
    department: { type: String },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', default: null },
    photoUrl: { type: String },
    paymentStatus: {
      type: String,
      enum: ['paid', 'unpaid', 'pending'],
      default: 'paid',
    },
    faceRegistrationStatus: {
      type: String,
      enum: ['not_registered', 'pending', 'registered', 'failed'],
      default: 'not_registered',
    },
    faceData: {
      embeddings: { type: [Number], default: [] },
      referenceImageUrl: { type: String },
      registeredAt: { type: Date },
      lastUpdatedAt: { type: Date },
      modelVersion: { type: String },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', StudentSchema);