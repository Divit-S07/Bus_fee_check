const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  uploadReceipts,
  getAllReceipts,
  getReceiptsByStudent,
  getReceiptImage,
  getReceiptStudentPhoto,
} = require('../controllers/receipt.controller');

const uploadDir = path.join(__dirname, '..', 'uploads', 'receipts');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const okMime =
      /^image\/(png|jpe?g|webp|bmp|tiff?)$/i.test(file.mimetype) ||
      file.mimetype === 'application/pdf' ||
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const okExt = /\.(png|jpe?g|webp|bmp|tiff?|pdf|docx)$/i.test(file.originalname);
    if (okMime || okExt) return cb(null, true);
    cb(new Error('Only image, PDF or DOCX files are allowed'));
  },
});

const router = express.Router();
router.use(authenticate);
router.get('/', getAllReceipts);
router.get('/student/:id', getReceiptsByStudent);
router.get('/:id/image', getReceiptImage);
router.get('/:id/photo', getReceiptStudentPhoto);
router.post(
  '/upload',
  requireRole(['super_admin', 'admin']),
  upload.array('receipts', 10),
  uploadReceipts
);

module.exports = router;
