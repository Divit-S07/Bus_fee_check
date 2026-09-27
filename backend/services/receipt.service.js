const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');

let workerPromise = null;

const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = createWorker('eng').catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
};

const runOcr = async (filePathOrBuffer) => {
  const worker = await getWorker();
  const { data } = await worker.recognize(filePathOrBuffer);
  return data.text || '';
};

const terminateOcr = async () => {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch (err) {
    // ignore
  } finally {
    workerPromise = null;
  }
};

const extractText = async (filePath, mimeType = '') => {
  const ext = path.extname(filePath || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (mime === 'application/pdf' || ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });
    try {
      const data = await parser.getText();
      return data.text || '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    const mammoth = require('mammoth');
    const { value } = await mammoth.extractRawText({ path: filePath });
    return value || '';
  }

  if (mime === 'application/msword' || ext === '.doc') {
    throw new Error('.doc is not supported — please re-save as .docx, PDF, or an image');
  }

  // images and anything else: OCR
  return runOcr(filePath);
};

const firstMatch = (text, regex) => {
  const m = text.match(regex);
  return m ? m[1].trim() : null;
};

const parseReceiptText = (text) => {
  const t = (text || '').replace(/\r/g, '').replace(/[|]/g, ' ');
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);

  // Extract value from a single line starting with a label: "Amount: Rs. 5000"
  const field = (labels) => {
    const re = new RegExp(`^(?:${labels})\\s*(?:no\\.?|number|#|id)?\\s*[:\\-#.]\\s*(.+)$`, 'i');
    for (const l of lines) {
      const m = l.match(re);
      if (m && m[1].trim()) return m[1].trim();
    }
    return null;
  };

  const receiptNumberRaw = field('receipt|rcpt|invoice|bill|txn|transaction|ref(?:erence)?|voucher');
  const receiptNumber = receiptNumberRaw
    ? (receiptNumberRaw.split(/\s{2,}|[.,;]|\s+(?:date|name|student|amount|total|fee|paid|by|on)\b/i)[0] || '').trim() || null
    : null;

  let amount = field('amount|total|fee|paid|fare|sum|price');
  if (amount) {
    const m = amount.match(/([\d][\d,]*(?:\.\d{1,2})?)/);
    amount = m ? m[1] : null;
  }
  if (!amount) {
    amount = firstMatch(t, /(?:rs\.?|inr|₹)\s*([\d][\d,]*(?:\.\d{1,2})?)/i);
  }

  let dateStr = field('date|dt\\.?|dated');
  if (dateStr) {
    const m = dateStr.match(/(\d{1,2}[\s\/\-.](?:\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s\/\-.]\d{2,4})/i);
    dateStr = m ? m[1] : null;
  }
  if (!dateStr) {
    dateStr = firstMatch(t, /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/);
  }
  let receiptDate = null;
  if (dateStr) {
    const normalized = dateStr.replace(/\s+/g, ' ').replace(/[\s\/\-.]/g, '/');
    const parts = normalized.split('/');
    if (parts.length === 3) {
      let [a, b, c] = parts;
      let day, month, year;
      if (/^[a-z]/i.test(b)) {
        day = parseInt(a, 10);
        month = b;
        year = c;
      } else {
        day = parseInt(a, 10);
        month = parseInt(b, 10);
        year = parseInt(c, 10);
      }
      if (typeof month === 'string') {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        month = months.indexOf(month.slice(0, 3).toLowerCase()) + 1;
      }
      if (year && year.length === 2) year = 2000 + parseInt(year, 10);
      if (day && month && year) {
        const d = new Date(Date.UTC(year, month - 1, day));
        if (!isNaN(d.getTime())) receiptDate = d;
      }
    }
  }

  const studentIdRaw = field('student|stu');
  const studentId = studentIdRaw
    ? (studentIdRaw.match(/^[A-Za-z0-9][A-Za-z0-9\-]{2,}/) || [])[0] || null
    : null;
  const rollRaw = field('roll|enrol(?:l)?ment|reg(?:istration)?');
  const rollnumber = rollRaw ? (rollRaw.match(/^[A-Za-z0-9][A-Za-z0-9\-]{2,}/) || [])[0] || null : null;
  const email = firstMatch(t, /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  const phone = firstMatch(t, /(?:\+?\d{1,3}[\s-]?)?(\d{10}|\d{5}[\s-]\d{5})\b/);

  let name = null;
  const nameLine = lines.find((l) => /^(?:name|student\s*name)\s*[:\-#]/i.test(l));
  if (nameLine) {
    const value = nameLine.replace(/^(?:name|student\s*name)\s*[:\-#]?\s*/i, '');
    const stopped = value.split(/\s{2,}|\s+(?:student|roll|enrol|reg|email|phone|contact|amount|fee|date|program|batch|address|receipt)\b/i)[0];
    if (stopped.trim().length >= 2) name = stopped.replace(/\s+/g, ' ').trim();
  }

  const programRaw = field('program|course|branch|dept\\.?');
  const program = programRaw
    ? programRaw.split(/\s{2,}|\s+(?:batch|year|session|amount|fee|total|date|roll|student)\b/i)[0].trim() || null
    : null;
  const batchRaw = field('batch|year|session|academic\\s*year');
  const batch = batchRaw
    ? batchRaw.split(/\s{2,}|\s+(?:program|course|amount|fee|total|date|roll|student|validity)\b/i)[0].trim() || null
    : null;

  let parsedAmount = null;
  if (amount) {
    const n = parseFloat(amount.replace(/,/g, ''));
    if (!isNaN(n)) parsedAmount = n;
  }

  return {
    receiptNumber,
    amount: parsedAmount,
    receiptDate,
    name: name ? name.replace(/\s+/g, ' ').trim() : null,
    studentId,
    rollnumber,
    email,
    phone: phone ? phone.replace(/[\s-]/g, '') : null,
    program,
    batch,
    rawText: text,
  };
};

module.exports = { runOcr, terminateOcr, extractText, parseReceiptText };
