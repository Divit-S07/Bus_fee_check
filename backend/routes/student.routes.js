const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  registerFace
} = require('../controllers/student.controller');

const router = express.Router();
router.use(authenticate);
router.get('/', getAllStudents);
router.get('/:id', getStudentById);
router.post('/', requireRole(['super_admin', 'admin']), createStudent);
router.put('/:id', requireRole(['super_admin', 'admin']), updateStudent);
router.delete('/:id', requireRole(['super_admin']), deleteStudent);
router.post('/:id/face-register', requireRole(['super_admin', 'admin']), registerFace);
module.exports = router;