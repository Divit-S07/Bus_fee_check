const crypto = require('crypto');
const Student = require('../models/Student');
const Bus = require('../models/Bus');
const FaceRecognitionLog = require('../models/FaceRecognitionLog');
const TravelRecord = require('../models/TravelRecord');
const UnpaidTravel = require('../models/UnpaidTravel');
const { getIO } = require('../sockets');
const faceAI = require('../services/faceAI.service');

const DEFAULT_LNG = parseFloat(process.env.DEFAULT_LOCATION_LONGITUDE || '0');
const DEFAULT_LAT = parseFloat(process.env.DEFAULT_LOCATION_LATITUDE || '0');

const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));
const hashImage = (image) => crypto.createHash('sha256').update(String(image)).digest('hex');

const safeEmit = (event, payload) => {
  try {
    getIO().emit(event, payload);
  } catch (e) {
    console.warn(`socket emit skipped (${event}): ${e.message}`);
  }
};

const studentSummary = (student) => ({
  _id: student._id,
  studentId: student.studentId,
  firstName: student.firstName,
  lastName: student.lastName,
  photoUrl: student.photoUrl || student.faceData?.referenceImageUrl || '',
  paymentStatus: student.paymentStatus,
  faceRegistrationStatus: student.faceRegistrationStatus,
  busRoute: student.busRoute,
});

const createLog = (payload) => FaceRecognitionLog.create(payload);

// POST /api/v1/face/scan  { image, busId, location? }
exports.scanFace = async (req, res, next) => {
  try {
    const { image, busId, location } = req.body || {};
    if (!image) return res.status(400).json({ message: 'image is required' });
    if (!busId) return res.status(400).json({ message: 'busId is required' });

    const bus = await Bus.findById(busId).select('busNumber routeName');
    if (!bus) return res.status(404).json({ message: 'Bus not found' });

    const match = await faceAI.matchFace(image);
    const timestamp = new Date();
    const imageHash = hashImage(image);
    const common = {
      busId,
      timestamp,
      imageHash,
      processingTimeMs: match.processing_time_ms || 0,
      modelVersion: match.model || 'unknown',
      faceCount: match.face_count || 0,
    };

    if (!match.matched || !match.best) {
      const status = match.best ? 'low_confidence' : 'unidentified';
      const log = await createLog({
        ...common,
        studentId: null,
        confidenceScore: clamp01(match.confidence),
        recognitionStatus: status,
        errorMessage: match.reason === 'no_faces_registered' ? 'No faces enrolled yet' : 'No registered face matched',
      });
      const result = {
        matched: false,
        status,
        logId: log._id,
        confidence: clamp01(match.confidence),
        threshold: match.threshold,
        model: match.model,
        bus: { _id: bus._id, busNumber: bus.busNumber },
        message:
          status === 'low_confidence'
            ? 'Face seen but confidence is below the match threshold - not recorded'
            : 'Unknown face - no registered student matched',
      };
      safeEmit('face-scan', result);
      return res.json(result);
    }

    const student = await Student.findById(match.best.student_id);
    if (!student || !student.isActive) {
      const log = await createLog({
        ...common,
        studentId: null,
        confidenceScore: clamp01(match.confidence),
        recognitionStatus: 'unidentified',
        errorMessage: 'Matched student not found or inactive',
      });
      const result = {
        matched: false,
        status: 'unidentified',
        logId: log._id,
        confidence: clamp01(match.confidence),
        message: 'Matched record is no longer an active student',
      };
      safeEmit('face-scan', result);
      return res.json(result);
    }

    const confidence = clamp01(match.confidence);
    const log = await createLog({
      ...common,
      studentId: student._id,
      confidenceScore: confidence,
      recognitionStatus: 'identified',
    });

    const summary = studentSummary(student);

    // Fee already paid -> nothing to record, let the rider through.
    if (student.paymentStatus === 'paid') {
      const result = {
        matched: true,
        status: 'paid_ignored',
        action: 'ignore',
        feeStatus: 'paid',
        student: summary,
        confidence,
        logId: log._id,
        model: match.model,
        bus: { _id: bus._id, busNumber: bus.busNumber },
        message: 'Fee already paid - boarding allowed, no unpaid travel recorded',
      };
      safeEmit('face-scan', result);
      return res.json(result);
    }

    // Fee not paid -> store the trip as travel-without-payment.
    const hasCoords =
      location &&
      Number.isFinite(Number(location.longitude)) &&
      Number.isFinite(Number(location.latitude));
    const coordinates = hasCoords
      ? [Number(location.longitude), Number(location.latitude)]
      : [DEFAULT_LNG, DEFAULT_LAT];

    const travel = await TravelRecord.create({
      studentId: student._id,
      busId,
      recognitionLogId: log._id,
      timestamp,
      direction: 'boarding',
      feeStatusAtTime: 'unpaid',
      isUnpaid: true,
      unpaidReason: 'no_payment',
      location: { type: 'Point', coordinates },
    });

    const priorUnresolved = await UnpaidTravel.countDocuments({ studentId: student._id, resolved: false });
    const repeatCount = priorUnresolved + 1;
    const unpaid = await UnpaidTravel.create({
      travelRecordId: travel._id,
      studentId: student._id,
      busId,
      timestamp,
      reason: 'no_payment',
      confidenceScore: confidence,
      isRepeatOffense: repeatCount > 1,
      repeatCount,
    });

    const result = {
      matched: true,
      status: 'unpaid_recorded',
      action: 'record_unpaid_travel',
      feeStatus: student.paymentStatus,
      student: summary,
      confidence,
      logId: log._id,
      travelId: travel._id,
      unpaidId: unpaid._id,
      repeatCount,
      isRepeatOffense: repeatCount > 1,
      model: match.model,
      bus: { _id: bus._id, busNumber: bus.busNumber },
      message: 'Fee not paid - travel stored as unpaid',
    };
    safeEmit('new-travel', { travel, unpaid, feeStatus: 'unpaid' });
    safeEmit('face-scan', result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

// POST /api/v1/face/register/:studentId  { image }
exports.registerStudentFace = async (req, res, next) => {
  try {
    const { image } = req.body || {};
    if (!image) return res.status(400).json({ message: 'image is required' });

    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const result = await faceAI.registerFace(String(student._id), image);
    if (!result?.embedding?.length) {
      const error = new Error('Face AI service returned an empty embedding');
      error.status = 502;
      throw error;
    }

    student.faceData = {
      embeddings: result.embedding,
      referenceImageUrl: result.reference_image_url,
      registeredAt: student.faceData?.registeredAt || new Date(),
      lastUpdatedAt: new Date(),
      modelVersion: result.model,
    };
    student.faceRegistrationStatus = 'registered';
    await student.save();

    safeEmit('face-registered', { studentId: student._id, model: result.model });
    return res.json({
      message: 'Face registered successfully',
      student,
      model: result.model,
      faceCount: result.face_count,
    });
  } catch (error) {
    return next(error);
  }
};

// GET /api/v1/face/health
exports.health = async (req, res) => {
  try {
    const health = await faceAI.getHealth();
    res.json({ ai: 'online', serviceUrl: faceAI.AI_SERVICE_URL, ...health });
  } catch (error) {
    res.json({
      ai: 'offline',
      serviceUrl: faceAI.AI_SERVICE_URL,
      message: error.message,
    });
  }
};
