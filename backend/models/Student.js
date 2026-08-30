const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    class: { type: String },
    department: { type: String },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
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