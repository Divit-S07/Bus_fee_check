const path = require('path');
const FeeReceipt = require('../models/FeeReceipt');
const Student = require('../models/Student');
const { extractText, extractImage, extractStudentPhoto, parseReceiptText } = require('../services/receipt.service');

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
    busRoute: parsed.busRoute || undefined,
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
        // 1. Extraction process: read text AND extract the receipt image
        const text = await extractText(file.path, file.mimetype);
        const image = await extractImage(file.path, file.mimetype);
        // Extract the student photo from the receipt (small rectangle box around it / face)
        const studentPhoto = await extractStudentPhoto(file.path, file.mimetype);
        const parsed = parseReceiptText(text);
        let { student, method } = await findStudent(parsed);
        let created = false;

        if (!student) {
          // Not in DB → create the new student record from the receipt data
          const doc = buildStudentFromReceipt(parsed);
          const duplicate = await Student.findOne({ studentId: doc.studentId });
          if (duplicate) {
            student = duplicate;
            method = 'studentId';
          } else {
            if (studentPhoto) {
              doc.photoUrl = studentPhoto.dataUrl;
            }
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
          image: image ? { data: image.buffer, contentType: image.contentType } : undefined,
          studentPhoto: studentPhoto
            ? { data: studentPhoto.buffer, contentType: studentPhoto.contentType }
            : undefined,
          ocrText: text,
          parsed: {
            name: parsed.name,
            studentId: parsed.studentId,
            rollnumber: parsed.rollnumber,
            email: parsed.email,
            phone: parsed.phone,
            program: parsed.program,
            batch: parsed.batch,
            route: parsed.busRoute,
          },
          status: created ? 'created' : 'matched',
          uploadedBy: req.user._id,
        });

        if (created) {
          // New student: full record already saved above (paid, route, fee, photo)
        } else {
          // Existing student: only update fee status and bus route
          student.paymentStatus = 'paid';
          if (parsed.busRoute) student.busRoute = parsed.busRoute;
          // store the extracted photo only if the student doesn't have one yet
          if (studentPhoto && !student.photoUrl) student.photoUrl = studentPhoto.dataUrl;
          await student.save();
        }

        results.push({
          receiptId: receipt._id,
          fileName: file.originalname,
          status: receipt.status,
          receiptNumber: parsed.receiptNumber,
          amount: parsed.amount,
          receiptDate: parsed.receiptDate,
          busRoute: parsed.busRoute || null,
          hasImage: !!image,
          hasStudentPhoto: !!studentPhoto,
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
      .select('-image -studentPhoto -ocrText')
      .populate('student', 'firstName lastName studentId rollnumber')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(receipts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReceiptImage = async (req, res) => {
  try {
    const receipt = await FeeReceipt.findById(req.params.id).select('image fileName');
    if (!receipt || !receipt.image || !receipt.image.data) {
      return res.status(404).json({ message: 'Receipt image not found' });
    }
    res.set('Content-Type', receipt.image.contentType || 'application/octet-stream');
    res.send(receipt.image.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Student photo cropped out of the receipt (stored during extraction)
exports.getReceiptStudentPhoto = async (req, res) => {
  try {
    const receipt = await FeeReceipt.findById(req.params.id).select('studentPhoto');
    if (!receipt || !receipt.studentPhoto || !receipt.studentPhoto.data) {
      return res.status(404).json({ message: 'Student photo not found' });
    }
    res.set('Content-Type', receipt.studentPhoto.contentType || 'application/octet-stream');
    res.send(receipt.studentPhoto.data);
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
