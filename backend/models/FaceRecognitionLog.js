const mongoose = require('mongoose');

const FaceRecognitionLogSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
    timestamp: { type: Date, required: true, index: true },
    confidenceScore: { type: Number, required: true, min: 0, max: 1 },
    recognitionStatus: { type: String, enum: ['identified', 'unidentified', 'low_confidence', 'error'], required: true },
    imageHash: { type: String, required: true },
    processingTimeMs: { type: Number, required: true },
    modelVersion: { type: String, required: true },
    errorMessage: { type: String },
    faceCount: { type: Number, default: 1 },
    framesUsed: { type: Number },
    isUnknown: { type: Boolean, default: false },
    // raw JPEG of the rejected frame; select:false so normal log queries stay light
    capturedImage: { type: Buffer, select: false },
    capturedImageContentType: { type: String, default: 'image/jpeg' },
    capturedImageUrl: { type: String },
    isManualReview: { type: Boolean, default: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FaceRecognitionLog', FaceRecognitionLogSchema);