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

// 1) Face detection — crop the face (with margin so the box border is included)
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
        new fa.TinyFaceDetectorOptions({ inputSize: 512, threshold: 0.4 })
      );
    } finally {
      fa.tf.dispose(tensor);
    }
    if (!detections || !detections.length) return null;

    // biggest / most confident face
    const det = detections
      .slice()
      .sort(
        (a, b) =>
          b.box.width * b.box.height * (b.score || 1) - a.box.width * a.box.height * (a.score || 1)
      )[0];

    // back to original image coordinates
    const cx = (det.box.x + det.box.width / 2) / img.scaleX;
    const cy = (det.box.y + det.box.height / 2) / img.scaleY;
    const fh = (det.box.height / img.scaleY) * 2.1; // include the photo frame around the face
    const fw = fh * 0.75;
    return cropRegion(raster.buffer, { left: cx - fw / 2, top: cy - fh / 2, width: fw, height: fh });
  } catch (err) {
    return null;
  }
};

// 2) Rectangle-box detection — find the small frame drawn around the student photo
const detectBoxPhoto = async (raster) => {
  try {
    const sharp = require('sharp');
    const meta = await sharp(raster.buffer).metadata();
    if (!meta.width || !meta.height) return null;

    const W = 480;
    const scale = W / meta.width;
    const H = Math.max(2, Math.round(meta.height * scale));
    const { data } = await sharp(raster.buffer)
      .resize(W, H)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // edge map (gradient magnitude)
    const edge = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = data[i + 1] - data[i - 1];
        const gy = data[i + W] - data[i - W];
        if (Math.abs(gx) + Math.abs(gy) > 55) edge[i] = 1;
      }
    }

    const maxGap = 2;
    const minHLen = Math.max(10, Math.round(W * 0.05));
    const minVLen = Math.max(10, Math.round(H * 0.05));
    const hRuns = [];
    const vRuns = [];

    for (let y = 0; y < H; y++) {
      let start = -1;
      let gap = 0;
      for (let x = 0; x < W; x++) {
        if (edge[y * W + x]) {
          if (start < 0) start = x;
          gap = 0;
        } else if (start >= 0) {
          gap++;
          if (gap > maxGap) {
            const end = x - gap;
            if (end - start >= minHLen) hRuns.push({ y, x0: start, x1: end });
            start = -1;
            gap = 0;
          }
        }
      }
      if (start >= 0 && W - start >= minHLen) hRuns.push({ y, x0: start, x1: W - 1 });
    }

    for (let x = 0; x < W; x++) {
      let start = -1;
      let gap = 0;
      for (let y = 0; y < H; y++) {
        if (edge[y * W + x]) {
          if (start < 0) start = y;
          gap = 0;
        } else if (start >= 0) {
          gap++;
          if (gap > maxGap) {
            const end = y - gap;
            if (end - start >= minVLen) vRuns.push({ x, y0: start, y1: end });
            start = -1;
            gap = 0;
          }
        }
      }
      if (start >= 0 && H - start >= minVLen) vRuns.push({ x, y0: start, y1: H - 1 });
    }

    const tolX = Math.max(3, Math.round(W * 0.012));
    const tolY = Math.max(3, Math.round(H * 0.012));
    const pageArea = W * H;
    let best = null;
    let bestScore = 0;

    for (let i = 0; i < hRuns.length; i++) {
      for (let j = i + 1; j < hRuns.length; j++) {
        const t = hRuns[i];
        const b = hRuns[j];
        if (b.y <= t.y + 4) continue;
        const boxH = b.y - t.y;
        if (boxH < H * 0.03 || boxH > H * 0.6) continue;

        const lo = Math.max(t.x0, b.x0);
        const hi = Math.min(t.x1, b.x1);
        const boxW = hi - lo;
        if (boxW < minHLen) continue;
        const overlapRatio = boxW / Math.max(1, Math.min(t.x1 - t.x0, b.x1 - b.x0));
        if (overlapRatio < 0.65) continue;

        const aspect = boxW / boxH;
        if (aspect < 0.5 || aspect > 1.9) continue;

        // require a matching vertical border on the left AND the right → a real box
        const leftOk = vRuns.some(
          (v) =>
            Math.abs(v.x - lo) <= tolX &&
            v.y0 <= t.y + tolY &&
            v.y1 >= b.y - tolY &&
            v.y1 - v.y0 >= boxH * 0.7
        );
        const rightOk = vRuns.some(
          (v) =>
            Math.abs(v.x - hi) <= tolX &&
            v.y0 <= t.y + tolY &&
            v.y1 >= b.y - tolY &&
            v.y1 - v.y0 >= boxH * 0.7
        );
        if (!leftOk || !rightOk) continue;

        const areaRatio = (boxW * boxH) / pageArea;
        if (areaRatio > 0.35 || areaRatio < 0.002) continue; // small box only

        // prefer smaller, more photo-shaped boxes (3:4-ish)
        const shapeBonus = 1 - Math.min(1, Math.abs(aspect - 0.75) / 0.75);
        const score = overlapRatio * (1 - areaRatio) * (0.5 + 0.5 * shapeBonus);
        if (score > bestScore) {
          bestScore = score;
          best = { left: lo / scale, top: t.y / scale, width: boxW / scale, height: boxH / scale };
        }
      }
    }

    if (!best) return null;
    return cropRegion(raster.buffer, best);
  } catch (err) {
    return null;
  }
};

// Main entry: find the student photo inside the receipt
const extractStudentPhoto = async (filePath, mimeType = '') => {
  try {
    const rasters = await getReceiptRasters(filePath, mimeType);
    for (const raster of rasters) {
      const byFace = await detectFacePhoto(raster);
      if (byFace) return byFace;
      const byBox = await detectBoxPhoto(raster);
      if (byBox) return byBox;
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
