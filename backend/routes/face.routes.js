const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  scanFace, registerStudentFace, health, detectFace, listUnknownFaces, unknownFaceImage,
} = require('../controllers/face.controller');

const router = express.Router();

router.get('/health', health);
router.use(authenticate);
// unknown-face gallery (admin review of everyone the scanner could not place)
router.get('/unknown', listUnknownFaces);
router.get('/unknown/:logId/image', unknownFaceImage);
// polled by the auto-scan loop - cheap, and rate-limit exempt in server.js
router.post('/detect', detectFace);
router.post('/scan', scanFace);
router.post('/register/:studentId', requireRole(['super_admin', 'admin']), registerStudentFace);

module.exports = router;
