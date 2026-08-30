const Student = require('../models/Student');
const Bus = require('../models/Bus');

// Get all students
exports.getAllStudents = async (req, res) => {
  try {
    const students = await Student.find().populate('busId', 'busNumber');
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get student by ID
exports.getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate('busId');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create student
exports.createStudent = async (req, res) => {
  try {
    const student = new Student(req.body);
    await student.save();
    // Add student to bus assignedStudents
    await Bus.findByIdAndUpdate(student.busId, { $push: { assignedStudents: student._id } });
    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update student
exports.updateStudent = async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete student
exports.deleteStudent = async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    await Bus.findByIdAndUpdate(student.busId, { $pull: { assignedStudents: student._id } });
    res.json({ message: 'Student deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Register face
exports.registerFace = async (req, res) => {
  try {
    const { embeddings, referenceImageUrl, modelVersion } = req.body;
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    student.faceData = {
      embeddings,
      referenceImageUrl,
      registeredAt: new Date(),
      lastUpdatedAt: new Date(),
      modelVersion: modelVersion || 'v1',
    };
    student.faceRegistrationStatus = 'registered';
    await student.save();
    res.json({ message: 'Face registered successfully', student });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};