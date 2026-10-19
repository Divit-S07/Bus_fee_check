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

  const routeRaw = field('bus\\s*route|route');
  const busRoute = routeRaw
    ? routeRaw.split(/\s{2,}|\s+(?:amount|fee|total|date|receipt|boarding|point|validity|program|batch)\b/i)[0].trim() || null
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
    busRoute,
    rawText: text,
  };
};

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

// Extract the receipt image itself (as a buffer + data URL) from the uploaded file
const extractImage = async (filePath, mimeType = '') => {
  const ext = path.extname(filePath || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  try {
    // Plain image upload → use it directly
    if (mime.startsWith('image/') || MIME_BY_EXT[ext]) {
      const buffer = fs.readFileSync(filePath);
      const contentType = mime.startsWith('image/') ? mime : MIME_BY_EXT[ext];
      return { buffer, contentType, dataUrl: `data:${contentType};base64,${buffer.toString('base64')}` };
    }

    // PDF → render page 1 as an image
    if (mime === 'application/pdf' || ext === '.pdf') {
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: fs.readFileSync(filePath) });
      try {
        const shot = await parser.getScreenshot({ pageNum: 1, imageDataUrl: true, scale: 2 });
        const page = (shot.pages || [])[0];
        if (page?.dataUrl) {
          const [head, b64] = page.dataUrl.split(',');
          const contentType = (head.match(/data:([^;]+);base64/) || [])[1] || 'image/png';
          return { buffer: Buffer.from(b64, 'base64'), contentType, dataUrl: page.dataUrl };
        }
      } finally {
        await parser.destroy().catch(() => {});
      }
      return null;
    }

    // DOCX → pull the first embedded image (word/media/*)
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    ) {
      const JSZip = require('jszip');
      const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
      const media = Object.keys(zip.files).filter((f) => /^word\/media\//.test(f)).sort();
      for (const f of media) {
        const contentType = MIME_BY_EXT[path.extname(f).toLowerCase()];
        if (!contentType) continue;
        const buffer = await zip.files[f].async('nodebuffer');
        return { buffer, contentType, dataUrl: `data:${contentType};base64,${buffer.toString('base64')}` };
      }
      return null;
    }
  } catch (err) {
    return null;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Student photo extraction
// Clue: on the receipt the student photo sits inside a small rectangle box.
// Strategy:
//   1. Get raster image(s) of the receipt (uploaded image / PDF page / DOCX media)
//   2. Try face detection first (face inside the box) → crop around it
//   3. Otherwise detect the small rectangle frame drawn around the photo → crop it
// ---------------------------------------------------------------------------

const getReceiptRasters = async (filePath, mimeType = '') => {
  const ext = path.extname(filePath || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  const rasters = [];

  if (mime.startsWith('image/') || MIME_BY_EXT[ext]) {
    rasters.push({
      buffer: fs.readFileSync(filePath),
      contentType: mime.startsWith('image/') ? mime : MIME_BY_EXT[ext],
    });
    return rasters;
  }

  if (mime === 'application/pdf' || ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });
    try {
      const shot = await parser.getScreenshot({ pageNum: 1, imageDataUrl: true, scale: 2 });
      const page = (shot.pages || [])[0];
      if (page?.dataUrl) {
        const [head, b64] = page.dataUrl.split(',');
        const contentType = (head.match(/data:([^;]+);base64/) || [])[1] || 'image/png';
        rasters.push({ buffer: Buffer.from(b64, 'base64'), contentType });
      }
    } finally {
      await parser.destroy().catch(() => {});
    }
    return rasters;
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const media = Object.keys(zip.files)
      .filter((f) => /^word\/media\//.test(f))
      .sort();
    for (const f of media) {
      const contentType = MIME_BY_EXT[path.extname(f).toLowerCase()];
      if (!contentType) continue;
      rasters.push({ buffer: await zip.files[f].async('nodebuffer'), contentType });
    }
    return rasters;
  }

  return rasters;
};

// Load face-api once (wasm backend, models ship inside node_modules → no internet needed)
let faceApiPromise = null;
const getFaceApi = async () => {
  if (!faceApiPromise) {
    faceApiPromise = (async () => {
      const fa = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
      await fa.tf.setBackend('wasm');
      await fa.tf.ready();
      const modelPath = path.join(__dirname, '..', 'node_modules', '@vladmandic', 'face-api', 'model');
      await fa.nets.tinyFaceDetector.loadFromDisk(modelPath);
      return fa;
    })().catch((err) => {
      faceApiPromise = null;
      throw err;
    });
  }
  return faceApiPromise;
};

// Normalise any image to raw RGB (W×H×3) for the detector
const toRgbRaw = async (buffer, maxWidth = 800) => {
  const sharp = require('sharp');
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) return null;
  const scale = Math.min(1, maxWidth / meta.width);
  const width = Math.max(1, Math.round(meta.width * scale));
  const height = Math.max(1, Math.round(meta.height * scale));
  const { data, info } = await sharp(buffer)
    .resize(width, height, { fit: 'inside', withoutEnlargement: false })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let rgb;
  if (info.channels === 3) {
    rgb = new Uint8Array(data.buffer, data.byteOffset, data.length);
  } else if (info.channels === 1) {
    rgb = new Uint8Array(info.width * info.height * 3);
    for (let i = 0; i < info.width * info.height; i++) {
      rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = data[i];
    }
  } else {
    rgb = new Uint8Array(info.width * info.height * 3);
    for (let i = 0; i < info.width * info.height; i++) {
      rgb[i * 3] = data[i * info.channels];
      rgb[i * 3 + 1] = data[i * info.channels + 1];
      rgb[i * 3 + 2] = data[i * info.channels + 2];
    }
  }

  return {
    rgb,
    width: info.width,
    height: info.height,
    scaleX: info.width / meta.width,
    scaleY: info.height / meta.height,
    origWidth: meta.width,
    origHeight: meta.height,
  };
};

// Crop a region from the original buffer → jpeg { buffer, contentType, dataUrl }
const cropRegion = async (buffer, region) => {
  const sharp = require('sharp');
  const meta = await sharp(buffer).metadata();
  const left = Math.max(0, Math.min(Math.round(region.left), meta.width - 1));
  const top = Math.max(0, Math.min(Math.round(region.top), meta.height - 1));
  const width = Math.max(1, Math.min(Math.round(region.width), meta.width - left));
  const height = Math.max(1, Math.min(Math.round(region.height), meta.height - top));
  const out = await sharp(buffer)
    .extract({ left, top, width, height })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { buffer: out, contentType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${out.toString('base64')}` };
};

// ---------------------------------------------------------------------------
// Student Photo Extraction from Receipt
// College receipts place the student passport photo in the TOP-RIGHT corner
// enclosed within a rectangular frame.
// Strategy:
//   1. Focus specifically on the TOP-RIGHT quadrant / corner (ROI)
//   2. Method A: Detect the passport photo rectangular box / frame in the top-right
//   3. Method B: Detect face inside the top-right ROI and crop passport portrait
//   4. Method C: Scan for high-density non-white photo component in top-right
//   5. Fallback: Full-page face detection and full-page box detection
// ---------------------------------------------------------------------------

// 1) Top-Right Rectangle Box / Frame Detection
const detectTopRightBoxPhoto = async (raster) => {
  try {
    const sharp = require('sharp');
    const meta = await sharp(raster.buffer).metadata();
    if (!meta.width || !meta.height) return null;
    const W = meta.width;
    const H = meta.height;

    // Focus on Top-Right Quadrant (where student photos sit on fee receipts)
    const roiX = Math.round(W * 0.50);
    const roiY = Math.round(H * 0.06);
    const roiW = W - roiX;
    const roiH = Math.round(H * 0.46);

    if (roiW < 60 || roiH < 60) return null;

    const roiBuffer = await sharp(raster.buffer)
      .extract({ left: roiX, top: roiY, width: roiW, height: roiH })
      .toBuffer();

    const { data: greyData } = await sharp(roiBuffer)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // White paper background is typically > 235
    const isDark = (v) => v < 235;
    const candidates = [];

    // Search for rectangular borders
    const step = 2;
    for (let top = 10; top < roiH - 60; top += step) {
      for (let left = 15; left < roiW - 60; left += step) {
        let hLen = 0;
        while (left + hLen < roiW && isDark(greyData[top * roiW + left + hLen])) {
          hLen++;
        }
        if (hLen < 50 || hLen > roiW * 0.9) continue;

        let vLen = 0;
        while (top + vLen < roiH && isDark(greyData[(top + vLen) * roiW + left])) {
          vLen++;
        }
        if (vLen < 50 || vLen > roiH * 0.9) continue;

        const aspect = hLen / vLen;
        // Standard passport / portrait aspect ratio (width / height ~ 0.55 to 1.35)
        if (aspect >= 0.55 && aspect <= 1.35) {
          candidates.push({ left, top, width: hLen, height: vLen, aspect });
        }
      }
    }

    if (candidates.length > 0) {
      // Sort candidates by preference for typical passport ratio (~0.75 - 0.8) and larger area
      candidates.sort((a, b) => {
        const scoreA = (a.width * a.height) * (1 - Math.abs(a.aspect - 0.78));
        const scoreB = (b.width * b.height) * (1 - Math.abs(b.aspect - 0.78));
        return scoreB - scoreA;
      });

      const best = candidates[0];
      const origLeft = Math.max(0, roiX + best.left);
      const origTop = Math.max(0, roiY + best.top);
      const origWidth = Math.min(W - origLeft, best.width);
      const origHeight = Math.min(H - origTop, best.height);

      const out = await sharp(raster.buffer)
        .extract({ left: origLeft, top: origTop, width: origWidth, height: origHeight })
        .jpeg({ quality: 92 })
        .toBuffer();

      return {
        buffer: out,
        contentType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,' + out.toString('base64'),
      };
    }

    return null;
  } catch (err) {
    return null;
  }
};

// 2) Top-Right Face Detection
const detectTopRightFacePhoto = async (raster) => {
  try {
    const sharp = require('sharp');
    const meta = await sharp(raster.buffer).metadata();
    if (!meta.width || !meta.height) return null;
    const W = meta.width;
    const H = meta.height;

    const roiX = Math.round(W * 0.50);
    const roiY = Math.round(H * 0.06);
    const roiW = W - roiX;
    const roiH = Math.round(H * 0.46);

    const roiBuffer = await sharp(raster.buffer)
      .extract({ left: roiX, top: roiY, width: roiW, height: roiH })
      .toBuffer();

    const fa = await getFaceApi();
    const targetW = 416;
    const targetH = Math.round((roiH * targetW) / roiW);

    const { data: rawData, info } = await sharp(roiBuffer)
      .resize(targetW, targetH)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let rgb;
    if (info.channels === 3) {
      rgb = new Uint8Array(rawData.buffer, rawData.byteOffset, rawData.length);
    } else {
      rgb = new Uint8Array(targetW * targetH * 3);
      for (let i = 0; i < targetW * targetH; i++) {
        rgb[i * 3] = rawData[i];
        rgb[i * 3 + 1] = rawData[i];
        rgb[i * 3 + 2] = rawData[i];
      }
    }

    const tensor = fa.tf.tensor3d(rgb, [targetH, targetW, 3], 'int32');
    let detections;
    try {
      detections = await fa.detectAllFaces(
        tensor,
        new fa.TinyFaceDetectorOptions({ inputSize: 416, threshold: 0.15 })
      );
    } finally {
      fa.tf.dispose(tensor);
    }

    if (!detections || !detections.length) return null;

    const det = detections.sort((a, b) => (b.score || 1) - (a.score || 1))[0];
    const scale = targetW / roiW;
    const faceX = roiX + det.box.x / scale;
    const faceY = roiY + det.box.y / scale;
    const faceW = det.box.width / scale;
    const faceH = det.box.height / scale;

    const photoH = faceH * 2.3;
    const photoW = photoH * 0.78;
    const photoX = Math.max(0, Math.min(W - photoW, faceX + faceW / 2 - photoW / 2));
    const photoY = Math.max(0, Math.min(H - photoH, faceY + faceH * 0.42 - photoH * 0.45));

    const out = await sharp(raster.buffer)
      .extract({
        left: Math.round(photoX),
        top: Math.round(photoY),
        width: Math.round(photoW),
        height: Math.round(photoH),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      buffer: out,
      contentType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,' + out.toString('base64'),
    };
  } catch (err) {
    return null;
  }
};

// 3) Full-Page Fallback Face Detection
const detectFacePhoto = async (raster) => {
  try {
    const fa = await getFaceApi();
    const img = await toRgbRaw(raster.buffer);
    if (!img) return null;
    const tensor = fa.tf.tensor3d(img.rgb, [img.height, img.width, 3], 'int32');
    let detections;
    try {
      detections = await fa.detectAllFaces(
        tensor,
        new fa.TinyFaceDetectorOptions({ inputSize: 512, threshold: 0.25 })
      );
    } finally {
      fa.tf.dispose(tensor);
    }
    if (!detections || !detections.length) return null;

    const det = detections
      .slice()
      .sort(
        (a, b) =>
          b.box.width * b.box.height * (b.score || 1) - a.box.width * a.box.height * (a.score || 1)
      )[0];

    const cx = (det.box.x + det.box.width / 2) / img.scaleX;
    const cy = (det.box.y + det.box.height / 2) / img.scaleY;
    const fh = (det.box.height / img.scaleY) * 2.1;
    const fw = fh * 0.75;
    return cropRegion(raster.buffer, { left: cx - fw / 2, top: cy - fh / 2, width: fw, height: fh });
  } catch (err) {
    return null;
  }
};

// Main entry: extract student photo from receipt (prioritizes top-right corner)
const extractStudentPhoto = async (filePath, mimeType = '') => {
  try {
    const rasters = await getReceiptRasters(filePath, mimeType);
    for (const raster of rasters) {
      // 1. High-accuracy Top-Right Box Detection
      const byTopRightBox = await detectTopRightBoxPhoto(raster);
      if (byTopRightBox) return byTopRightBox;

      // 2. Top-Right Neural Face Detection
      const byTopRightFace = await detectTopRightFacePhoto(raster);
      if (byTopRightFace) return byTopRightFace;

      // 3. Full-page face detection fallback
      const byFace = await detectFacePhoto(raster);
      if (byFace) return byFace;
    }
    return null;
  } catch (err) {
    return null;
  }
};

module.exports = {
  runOcr,
  terminateOcr,
  extractText,
  extractImage,
  extractStudentPhoto,
  parseReceiptText,
};
