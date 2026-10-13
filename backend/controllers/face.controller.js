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
// TravelRecord.feeStatusAtTime only accepts paid|unpaid|expired
const FEE_AT_TIME = { paid: 'paid', expired: 'expired', unpaid: 'unpaid' };
const hashImage = (image) => crypto.createHash('sha256').update(String(image)).digest('hex');

// up to 5 consecutive frames; a single legacy `image` field still works
const pickFrames = (body = {}) => {
  const list = Array.isArray(body.images) ? body.images : body.image ? [body.image] : [];
  return list.filter((f) => typeof f === 'string' && f.length > 32).slice(0, 5);
};

// Unknown faces are kept in MongoDB on the FaceRecognitionLog document itself -
// no files on disk, so the capture survives restarts, redeploys and git cleanups.
const decodeFrame = (image) => {
  try {
    const raw = String(image).match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
    const base64 = raw ? raw[2] : String(image);
    if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) return { buffer: null, contentType: 'image/jpeg' };
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) return { buffer: null, contentType: 'image/jpeg' };
    return { buffer, contentType: raw ? `image/${raw[1].toLowerCase()}` : 'image/jpeg' };
  } catch (error) {
    console.warn(`could not decode captured face image: ${error.message}`);
    return { buffer: null, contentType: 'image/jpeg' };
  }
};

const toDataUrl = (buffer, contentType) =>
  buffer && buffer.length ? `data:${contentType || 'image/jpeg'};base64,${buffer.toString('base64')}` : '';

const safeEmit = (event, payload) => {
  try {
    // the photo can be ~150 kB - keep it out of the realtime broadcast
    const body =
      payload && payload.capturedImage ? (({ capturedImage, ...rest }) => rest)(payload) : payload;
    getIO().emit(event, body);
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

// POST /api/v1/face/detect  { image }  - presence check only, nothing is logged
exports.detectFace = async (req, res, next) => {
  try {
    const frames = pickFrames(req.body);
    if (!frames.length) return res.status(400).json({ message: 'image is required' });
    const out = await faceAI.detectFace(frames[0]);
    res.json(out);
  } catch (error) {
    return next(error);
  }
};

// POST /api/v1/face/scan  { image | images[], busId, location? }
exports.scanFace = async (req, res, next) => {
  try {
    const { busId, location } = req.body || {};
    const frames = pickFrames(req.body);
    if (!frames.length) return res.status(400).json({ message: 'image is required' });
    if (!busId) return res.status(400).json({ message: 'busId is required' });

    const bus = await Bus.findById(busId).select('busNumber routeName');
    if (!bus) return res.status(404).json({ message: 'Bus not found' });

    const match = await faceAI.matchFace(frames);
    const timestamp = new Date();
    const imageHash = hashImage(frames.join('|'));
    const common = {
      busId,
      timestamp,
      imageHash,
      processingTimeMs: match.processing_time_ms || 0,
      modelVersion: match.model || 'unknown',
      faceCount: match.face_count || 0,
      framesUsed: match.frames_used || frames.length,
    };

    if (!match.matched || !match.best) {
      const status = match.best ? 'low_confidence' : 'unidentified';
      const { buffer: capturedImage, contentType } = decodeFrame(frames[0]);
      const log = await createLog({
        ...common,
        studentId: null,
        confidenceScore: clamp01(match.confidence),
        recognitionStatus: status,
        isUnknown: true,
        capturedImage: capturedImage || undefined,
        capturedImageContentType: contentType,
        errorMessage:
          match.reason === 'no_faces_registered'
            ? 'Person not found - no faces enrolled yet'
            : match.best
              ? match.reason === 'ambiguous'
                ? `Person not found - match too close to another face (gap ${((Number(match.margin) || 0) * 100).toFixed(1)}%)`
                : `Person not found - best confidence ${clamp01(match.confidence)} below threshold ${clamp01(match.threshold)}`
              : 'Person not found - no registered face matched',
      });
      const result = {
        matched: false,
        status,
        unknown: true,
        isUnknown: true,
        capturedImage: toDataUrl(capturedImage, contentType),
        logId: log._id,
        confidence: clamp01(match.confidence),
        threshold: match.threshold,
        model: match.model,
        frames: match.frames_used,
        framesTotal: match.frames_total,
        bus: { _id: bus._id, busNumber: bus.busNumber },
        message: 'Person not found',
      };
      safeEmit('face-scan', result);
      return res.json(result);
    }

    const student = await Student.findById(match.best.student_id);
    if (!student || !student.isActive) {
      const { buffer: capturedImage, contentType } = decodeFrame(frames[0]);
      const log = await createLog({
        ...common,
        studentId: null,
        confidenceScore: clamp01(match.confidence),
        recognitionStatus: 'unidentified',
        isUnknown: true,
        capturedImage: capturedImage || undefined,
        capturedImageContentType: contentType,
        errorMessage: 'Matched student not found or inactive',
      });
      const result = {
        matched: false,
        status: 'unidentified',
        unknown: true,
        isUnknown: true,
        capturedImage: toDataUrl(capturedImage, contentType),
        logId: log._id,
        confidence: clamp01(match.confidence),
        message: 'Person not found - matched record is no longer an active student',
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

    // TravelRecord feeStatusAtTime enum is paid|unpaid|expired, student.paymentStatus
    // is paid|unpaid|pending - anything not paid counts as an unpaid boarding.
    const isPaid = student.paymentStatus === 'paid';
    const feeAtTime = FEE_AT_TIME[student.paymentStatus] || 'unpaid';

    const hasCoords =
      location &&
      Number.isFinite(Number(location.longitude)) &&
      Number.isFinite(Number(location.latitude));
    const coordinates = hasCoords
      ? [Number(location.longitude), Number(location.latitude)]
      : [DEFAULT_LNG, DEFAULT_LAT];

    // EVERY matched boarding is stored for the day - paid riders included - so the
    // travel log shows who travelled, not just who travelled without paying.
    const travel = await TravelRecord.create({
      studentId: student._id,
      busId,
      recognitionLogId: log._id,
      timestamp,
      direction: 'boarding',
      feeStatusAtTime: feeAtTime,
      isUnpaid: !isPaid,
      ...(isPaid ? {} : { unpaidReason: 'no_payment' }),
      location: { type: 'Point', coordinates },
    });

    // Fee already paid -> boarding logged, nothing else to record.
    if (isPaid) {
      const result = {
        matched: true,
        status: 'paid_ignored',
        action: 'record_boarding',
        feeStatus: 'paid',
        student: summary,
        confidence,
        logId: log._id,
        travelId: travel._id,
        model: match.model,
        frames: match.frames_used,
        framesTotal: match.frames_total,
        bus: { _id: bus._id, busNumber: bus.busNumber },
        message: 'Fee already paid - boarding allowed and recorded for today',
      };
      safeEmit('new-travel', { travel, feeStatus: 'paid' });
      safeEmit('face-scan', result);
      return res.json(result);
    }

    // Fee not paid -> also track it as an unpaid trip.
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
      frames: match.frames_used,
      framesTotal: match.frames_total,
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

// POST /api/v1/face/register/:studentId  { image | images[] }
exports.registerStudentFace = async (req, res, next) => {
  try {
    const frames = pickFrames(req.body);
    if (!frames.length) return res.status(400).json({ message: 'image is required' });

    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const result = await faceAI.registerFace(String(student._id), frames);
    if (!result?.embedding?.length) {
      const error = new Error('Face AI service returned an empty embedding');
      error.status = 502;
      throw error;
    }

    student.faceData = {
      embeddings: result.embedding,
      // several templates from consecutive frames - matching picks the best hit
      templates: Array.isArray(result.templates) && result.templates.length ? result.templates : [result.embedding],
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

// GET /api/v1/face/unknown  - every scan we could not identify, with its photo
exports.listUnknownFaces = async (req, res, next) => {
  try {
    const { page = 1, limit = 12, startDate, endDate, status } = req.query;
    const filter = { isUnknown: true };
    // "Result" dropdown: low_confidence | unidentified
    if (status) filter.recognitionStatus = status;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        filter.timestamp = { $gte: start, $lte: end };
      }
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [data, total, today] = await Promise.all([
      FaceRecognitionLog.find(filter)
        .populate('busId', 'busNumber')
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit, 10) || 12)
        .select('-capturedImage'),
      FaceRecognitionLog.countDocuments(filter),
      FaceRecognitionLog.countDocuments({ isUnknown: true, timestamp: { $gte: startOfToday } }),
    ]);

    res.json({ data, total, today, page, limit });
  } catch (error) {
    return next(error);
  }
};

// GET /api/v1/face/unknown/:logId/image - the stored photo, served from MongoDB
exports.unknownFaceImage = async (req, res, next) => {
  try {
    const log = await FaceRecognitionLog.findById(req.params.logId).select('+capturedImage');
    if (!log) return res.status(404).json({ message: 'Unknown face record not found' });

    const buffer = log.capturedImage;
    if (buffer && buffer.length) {
      res.set('Content-Type', log.capturedImageContentType || 'image/jpeg');
      res.set('Cache-Control', 'private, max-age=86400');
      return res.send(buffer);
    }
    // records from before the image moved into the database still point at a file
    if (log.capturedImageUrl) return res.redirect(log.capturedImageUrl);
    return res.status(404).json({ message: 'No image stored for this record' });
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
