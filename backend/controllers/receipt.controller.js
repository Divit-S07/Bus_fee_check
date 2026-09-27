const path = require('path');
const FeeReceipt = require('../models/FeeReceipt');
const Student = require('../models/Student');
const { extractText, parseReceiptText } = require('../services/receipt.service');

const findStudent = async (parsed) => {
  const queries = [];
  if (parsed.studentId) queries.push({ studentId: parsed.studentId });
  if (parsed.rollnumber) queries.push({ rollnumber: parsed.rollnumber });
  if (parsed.email) queries.push({ email: parsed.email });
  if (parsed.phone) queries.push({ phonenumber: parsed.phone });

  for (const q of queries) {
    const student = await Student.findOne(q);
    if (student) return { student, method: Object.keys(q)[0] };
  }

  if (parsed.name) {
    const parts = parsed.name.split(/\s+/);
    if (parts.length >= 2) {
      const student = await Student.findOne({
        firstName: new RegExp(`^${escapeRegex(parts[0])}$`, 'i'),
        lastName: new RegExp(`^${escapeRegex(parts.slice(1).join(' '))}$`, 'i'),
      });
      if (student) return { student, method: 'name' };
    }
  }

  return { student: null, method: null };
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildStudentFromReceipt = (parsed) => {
  let firstName = '';
  let lastName = '';
  if (parsed.name) {
    const parts = parsed.name.trim().split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

  const studentId =
    parsed.studentId ||
    parsed.rollnumber ||
    `RCPT-${Date.now().toString().slice(-8)}`;

  return {
    studentId,
    firstName: firstName || parsed.rollnumber || studentId,
    lastName,
    email: parsed.email || undefined,
    phonenumber: parsed.phone || undefined,
    rollnumber: parsed.rollnumber || undefined,
    program: parsed.program || undefined,
    batch: parsed.batch || undefined,
    transportFee: parsed.amount || undefined,
    paymentStatus: 'paid',
  };
};

exports.uploadReceipts = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No receipt files uploaded' });
    }

    const results = [];

    for (const file of req.files) {
      try {
        const text = await extractText(file.path, file.mimetype);
        const parsed = parseReceiptText(text);
        let { student, method } = await findStudent(parsed);
        let created = false;

        if (!student) {
          // Not in DB → create the student record from the receipt data
          const doc = buildStudentFromReceipt(parsed);
          const duplicate = await Student.findOne({ studentId: doc.studentId });
          if (duplicate) {
            student = duplicate;
            method = 'studentId';
          } else {
            student = await Student.create(doc);
            created = true;
            method = 'created';
          }
        }

        const receipt = await FeeReceipt.create({
          student: student?._id,
          studentMatched: !!student,
          matchMethod: method,
          receiptNumber: parsed.receiptNumber,
          amount: parsed.amount,
          receiptDate: parsed.receiptDate,
          fileName: file.originalname,
          filePath: path.join('uploads', 'receipts', file.filename).replace(/\\/g, '/'),
          mimeType: file.mimetype,
          ocrText: text,
          parsed: {
            name: parsed.name,
            studentId: parsed.studentId,
            rollnumber: parsed.rollnumber,
            email: parsed.email,
            phone: parsed.phone,
            program: parsed.program,
            batch: parsed.batch,
          },
          status: created ? 'created' : 'matched',
          uploadedBy: req.user._id,
        });

        // Found in DB → just update payment status
        student.paymentStatus = 'paid';
        if (parsed.amount) student.transportFee = parsed.amount;
        await student.save();

        results.push({
          receiptId: receipt._id,
          fileName: file.originalname,
          status: receipt.status,
          receiptNumber: parsed.receiptNumber,
          amount: parsed.amount,
          receiptDate: parsed.receiptDate,
          student: {
            _id: student._id,
            name: `${student.firstName} ${student.lastName}`.trim(),
            studentId: student.studentId,
          },
          matchMethod: method,
          parsed: receipt.parsed,
        });
      } catch (err) {
        results.push({
          fileName: file.originalname,
          status: 'error',
          message: err.message,
        });
      }
    }

    const matched = results.filter((r) => r.status === 'matched').length;
    const createdCount = results.filter((r) => r.status === 'created').length;
    const parts = [`${results.length} receipt(s) processed`];
    if (matched) parts.push(`${matched} matched`);
    if (createdCount) parts.push(`${createdCount} new student(s) created`);
    res.status(201).json({
      message: parts.join(', '),
      results,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllReceipts = async (req, res) => {
  try {
    const receipts = await FeeReceipt.find()
      .populate('student', 'firstName lastName studentId rollnumber')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(receipts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReceiptsByStudent = async (req, res) => {
  try {
    const receipts = await FeeReceipt.find({ student: req.params.id })
      .populate('student', 'firstName lastName studentId rollnumber')
      .sort({ createdAt: -1 });
    res.json(receipts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
