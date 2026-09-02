const TravelRecord = require('../models/TravelRecord');
const UnpaidTravel = require('../models/UnpaidTravel');
const FaceRecognitionLog = require('../models/FaceRecognitionLog');
const { getIO } = require('../sockets');

class TravelService {
  static async processRecognitionEvent(data) {
    // 1. Create recognition log
    const log = await FaceRecognitionLog.create({
      studentId: data.studentId,
      busId: data.busId,
      timestamp: data.timestamp,
      confidenceScore: data.confidenceScore,
      recognitionStatus: data.recognitionStatus,
      imageHash: data.imageHash,
      processingTimeMs: 0,
      modelVersion: data.modelVersion,
      faceCount: 1,
    });

    // 2. Create travel record
    const travel = await TravelRecord.create({
      studentId: data.studentId,
      busId: data.busId,
      recognitionLogId: log._id,
      timestamp: data.timestamp,
      direction: 'boarding',
      feeStatusAtTime: 'active',
      isUnpaid: false,
      location: {
        type: 'Point',
        coordinates: [data.location.longitude, data.location.latitude],
      },
    });

    // 3. Emit real-time event via Socket.io
    const io = getIO();
    io.emit('new-travel', {
      travel,
      unpaid: null,
      feeStatus: 'active',
    });

    // 4. Return status to AI system
    return {
      status: 'active',
      action: 'allow_boarding',
    };
  }
}

module.exports = { TravelService };