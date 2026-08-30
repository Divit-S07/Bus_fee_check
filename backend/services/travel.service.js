const TravelRecord = require('../models/TravelRecord');
const UnpaidTravel = require('../models/UnpaidTravel');
const FaceRecognitionLog = require('../models/FaceRecognitionLog');
const { FeeService } = require('./fee.service');
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

    // 2. Check fee status
    const feeStatus = await FeeService.getCurrentFeeStatus(data.studentId);
    let isUnpaid = false;
    let unpaidReason;
    if (feeStatus.status !== 'paid') {
      isUnpaid = true;
      unpaidReason = feeStatus.status === 'expired' ? 'payment_expired' : 'no_payment';
    }

    // 3. Create travel record
    const travel = await TravelRecord.create({
      studentId: data.studentId,
      busId: data.busId,
      recognitionLogId: log._id,
      timestamp: data.timestamp,
      direction: 'boarding',
      feeStatusAtTime: feeStatus.status,
      paymentValidUntil: feeStatus.validUntil || undefined,
      isUnpaid,
      unpaidReason,
      location: {
        type: 'Point',
        coordinates: [data.location.longitude, data.location.latitude],
      },
    });

    // 4. If unpaid, create unpaid record
    let unpaidRecord = null;
    if (isUnpaid) {
      const repeatCount = await UnpaidTravel.countDocuments({ studentId: data.studentId, resolved: false });
      const isRepeatOffense = repeatCount >= 3;
      unpaidRecord = await UnpaidTravel.create({
        travelRecordId: travel._id,
        studentId: data.studentId,
        busId: data.busId,
        timestamp: data.timestamp,
        reason: unpaidReason,
        confidenceScore: data.confidenceScore,
        isRepeatOffense,
        repeatCount: repeatCount + 1,
        notifiedAdmin: false,
      });
    }

    // 5. Emit real-time event via Socket.io
    const io = getIO();
    io.emit('new-travel', {
      travel,
      unpaid: unpaidRecord,
      feeStatus: feeStatus.status,
    });

    // 6. Return fee status to AI system
    return {
      feeStatus: feeStatus.status,
      paymentValidUntil: feeStatus.validUntil,
      action: isUnpaid ? 'deny_boarding' : 'allow_boarding',
    };
  }
}

module.exports = { TravelService };