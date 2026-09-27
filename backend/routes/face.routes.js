const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { scanFace, registerStudentFace, health } = require('../controllers/face.controller');

const router = express.Router();

router.get('/health', health);
router.use(authenticate);
router.post('/scan', scanFace);
router.post('/register/:studentId', requireRole(['super_admin', 'admin']), registerStudentFace);

module.exports = router;
