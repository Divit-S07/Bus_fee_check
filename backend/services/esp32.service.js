/**
 * ESP32-CAM proxy - the browser cannot talk to the camera directly:
 *   1. the firmware sends no CORS headers, so fetch() from the SPA is blocked
 *   2. the still endpoint path varies per firmware (/capture, /photo, ...)
 *   3. the stream port varies (/stream on 81, / at root, /video ...)
 *
 * SINGLE-CONNECTION DESIGN
 * The AI-Thinker CameraWebServer reliably serves exactly one client. The old
 * proxy opened one connection for the <img> MJPEG stream AND another one every
 * second for /capture (AI) - the camera choked, the video stuttered and frames
 * lagged.
 *
 * This module opens ONE persistent upstream MJPEG connection, parses it into
 * JPEG frames and fans each frame out to:
 *   - every browser subscribed to GET /api/v1/esp32/stream  (live footage)
 *   - a "latest frame" slot read by GET /api/v1/esp32/capture (face AI)
 * It reconnects by itself when the camera drops.
 *
 * The camera address is configurable at runtime (GET/POST /api/v1/esp32/config)
 * and can be auto-discovered on the local network (GET /api/v1/esp32/scan).
 *
 * No extra npm packages - built-in modules only.
 */

const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/* =========================================================
   CAMERA ADDRESS (runtime-configurable, survives restarts)
   precedence: saved config file > ESP32_CAM_URL env > built-in default
   ========================================================= */

const CONFIG_FILE =
  process.env.ESP32_CONFIG_FILE || path.join(__dirname, '..', '.esp32-camera.json');

const normalizeBase = (url) => {
  if (!url) return '';
  let u = String(url).trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, '');
};

const readSavedBase = () => {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return normalizeBase(saved && saved.url);
  } catch {
    return '';
  }
};

let baseUrl = readSavedBase() || normalizeBase(process.env.ESP32_CAM_URL) || 'http://10.67.1.56';

const CONNECT_TIMEOUT_MS = parseInt(process.env.ESP32_CONNECT_TIMEOUT_MS || '1500', 10);
const FRAME_TIMEOUT_MS = parseInt(process.env.ESP32_FRAME_TIMEOUT_MS || '6000', 10);
const STILL_TIMEOUT_MS = parseInt(process.env.ESP32_TIMEOUT_MS || '5000', 10);
const RECONNECT_DELAY_MS = parseInt(process.env.ESP32_RECONNECT_DELAY_MS || '1000', 10);
const IDLE_CLOSE_MS = parseInt(process.env.ESP32_IDLE_CLOSE_MS || '5000', 10);
const SCAN_CONNECT_TIMEOUT_MS = parseInt(process.env.ESP32_SCAN_CONNECT_TIMEOUT_MS || '400', 10);
const SCAN_HTTP_TIMEOUT_MS = parseInt(process.env.ESP32_SCAN_HTTP_TIMEOUT_MS || '1200', 10);
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const MAX_STILL_BYTES = 8 * 1024 * 1024;

const STILL_PATHS = ['/capture', '/photo', '/snapshot', '/still', '/jpg'];

const JPEG_MAGIC = Buffer.from([0xff, 0xd8]);
const JPEG_END = Buffer.from([0xff, 0xd9]);
const isJpeg = (buf) => buf && buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8;

const STREAM_BOUNDARY = 'esp32frame';

const esp32Error = (message, extra = {}) => {
  const err = new Error(message);
  err.code = 'esp32_offline';
  Object.assign(err, extra);
  return err;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* =========================================================
   SHARED STATE
   ========================================================= */

const state = {
  res: null, // active upstream MJPEG response
  url: null, // the endpoint it came from
  buffer: Buffer.alloc(0), // partial-frame carry-over
  latest: null, // most recent complete JPEG (Buffer)
  latestAt: 0,
  attachedAt: 0, // when the current upstream connected
  clients: new Set(), // { res, busy, pending }
  opening: null, // in-flight connect promise
  want: false, // someone (browser or capture) needs frames
  reconnectTimer: null,
  idleTimer: null,
  lastError: null,
};

/* =========================================================
   LOW-LEVEL HTTP
   ========================================================= */

/**
 * Promise-wrapped GET with a hard connect timeout. `inactivityTimeout` is
 * optional (and OFF by default) because a healthy MJPEG stream must not be
 * killed for being momentarily quiet - the frame watchdog covers that.
 */
const get = (url, { connectTimeout = CONNECT_TIMEOUT_MS, inactivityTimeout = 0 } = {}) =>
  new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(new Error(`invalid url: ${url}`));
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    let settled = false;

    const req = lib.get(url, (res) => {
      settled = true;
      clearTimeout(connectTimer);
      if (inactivityTimeout) {
        req.setTimeout(inactivityTimeout, () =>
          req.destroy(esp32Error(`ESP32 stalled on ${url}`))
        );
      }
      resolve(res);
    });

    const connectTimer = setTimeout(() => {
      if (settled) return;
      req.destroy(esp32Error(`ESP32 connect timed out after ${connectTimeout} ms: ${url}`));
    }, connectTimeout);

    req.on('error', (e) => {
      clearTimeout(connectTimer);
      if (!settled) reject(e);
    });
  });

/* =========================================================
   STREAM URL CANDIDATES
   ========================================================= */

let workingStreamUrl = null;

const streamCandidates = () => {
  const u = new URL(baseUrl);
  const noPort = `${u.protocol}//${u.hostname}`;
  const candidates = [
    `${noPort}:81/stream`, // AI-Thinker CameraWebServer default
    `${baseUrl}/stream`,
    `${noPort}:81/video`,
    `${baseUrl}/video`,
    `${baseUrl}/`, // firmware that streams at the root
  ];
  if (workingStreamUrl) {
    return [workingStreamUrl, ...candidates.filter((c) => c !== workingStreamUrl)];
  }
  return candidates;
};

const isStreamContentType = (ct) => {
  if (!ct) return false;
  const c = ct.toLowerCase();
  return (
    c.includes('multipart/x-mixed-replace') ||
    c.includes('multipart/related') ||
    c.startsWith('image/')
  );
};

/* =========================================================
   FRAME PARSING + FAN-OUT
   ========================================================= */

/** Split the raw MJPEG byte stream into whole JPEG (SOI..EOI) frames. */
const extractFrames = (chunk) => {
  state.buffer = state.buffer.length ? Buffer.concat([state.buffer, chunk]) : chunk;
  if (state.buffer.length > MAX_BUFFER_BYTES) {
    state.buffer = state.buffer.slice(-MAX_BUFFER_BYTES);
  }

  const frames = [];
  const buf = state.buffer;
  let cursor = 0;

  for (;;) {
    const start = buf.indexOf(JPEG_MAGIC, cursor);
    if (start === -1) break;
    const end = buf.indexOf(JPEG_END, start + 2);
    if (end === -1) {
      cursor = start; // keep the partial frame for the next chunk
      break;
    }
    frames.push(buf.slice(start, end + 2));
    cursor = end + 2;
  }

  state.buffer = cursor > 0 ? buf.slice(cursor) : buf;
  return frames;
};

/** One MJPEG part with our own, well-formed boundary. */
const partFor = (frame) =>
  Buffer.concat([
    Buffer.from(`--${STREAM_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`),
    frame,
    Buffer.from('\r\n'),
  ]);

/**
 * Write a frame to one browser. If the client is slower than the camera we do
 * NOT queue every frame (that is what made the video drift further and further
 * behind) - we keep only the newest pending one and send it on drain.
 */
const sendToClient = (client, frame) => {
  const { res } = client;
  if (res.writableEnded || res.destroyed) {
    state.clients.delete(client);
    return;
  }
  if (client.busy) {
    client.pending = frame;
    return;
  }
  const ok = res.write(partFor(frame));
  if (!ok) {
    client.busy = true;
    res.once('drain', () => {
      client.busy = false;
      if (client.pending) {
        const next = client.pending;
        client.pending = null;
        sendToClient(client, next);
      }
    });
  }
};

const onFrame = (frame) => {
  state.latest = frame;
  state.latestAt = Date.now();
  for (const client of state.clients) sendToClient(client, frame);
};

/* =========================================================
   UPSTREAM (single camera connection)
   ========================================================= */

const attachUpstream = (res, url) => {
  workingStreamUrl = url;
  state.res = res;
  state.url = url;
  state.buffer = Buffer.alloc(0);
  state.latestAt = 0; // force consumers to wait for a fresh frame
  state.attachedAt = Date.now();
  state.lastError = null;

  res.on('data', (chunk) => {
    for (const frame of extractFrames(chunk)) onFrame(frame);
  });
  res.on('error', () => dropUpstream(res));
  res.on('close', () => dropUpstream(res));
  res.on('end', () => dropUpstream(res));
};

const dropUpstream = (res) => {
  if (res && state.res !== res) {
    if (!res.destroyed) res.destroy();
    return;
  }
  if (res && !res.destroyed) res.destroy();
  state.res = null;
  state.url = null;
  if (state.want) scheduleReconnect();
};

const scheduleReconnect = () => {
  if (state.reconnectTimer) return;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    if (state.want && !state.res) ensureUpstream().catch(() => {});
  }, RECONNECT_DELAY_MS);
};

/** Stop the reconnect loop when nobody is left waiting for frames. */
const releaseIfIdle = () => {
  if (state.clients.size) return;
  state.want = false;
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
};

const ensureUpstream = () => {
  if (state.res && !state.res.destroyed) return Promise.resolve(state.res);
  if (state.opening) return state.opening;

  const opening = (async () => {
    const attempted = [];
    for (const url of streamCandidates()) {
      attempted.push(url);
      try {
        const res = await get(url, { connectTimeout: CONNECT_TIMEOUT_MS });
        if (res.statusCode !== 200 || !isStreamContentType(res.headers['content-type'])) {
          res.resume();
          continue;
        }
        attachUpstream(res, url);
        return res;
      } catch (e) {
        state.lastError = e.message;
      }
    }
    const err = esp32Error(
      `ESP32-CAM stream not reachable on any known endpoint. Tried: ${attempted.join(', ')}`,
      { attempted }
    );
    state.lastError = err.message;
    if (state.want) scheduleReconnect();
    throw err;
  })();

  state.opening = opening;
  opening.then(
    () => {
      state.opening = null;
    },
    () => {
      state.opening = null;
    }
  );
  return opening;
};

/** Resolve with the newest frame, waiting up to `timeoutMs` for one. */
const waitForFrame = (timeoutMs = FRAME_TIMEOUT_MS) => {
  const since = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (state.latest && state.latestAt >= since) return resolve(state.latest);
      if (state.latest && Date.now() - state.latestAt < 300) return resolve(state.latest);
      if (Date.now() - since >= timeoutMs) {
        if (state.latest) return resolve(state.latest); // stale beats nothing
        return reject(
          state.lastError ? esp32Error(state.lastError) : esp32Error('ESP32-CAM produced no frame')
        );
      }
      setTimeout(check, 40);
    };
    check();
  });
};

/* =========================================================
   STILL-IMAGE FALLBACK (firmware with no MJPEG stream)
   ========================================================= */

const collect = (res, limit = MAX_STILL_BYTES) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    res.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        res.destroy();
        return reject(new Error('ESP32 response too large'));
      }
      chunks.push(chunk);
    });
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
    res.on('aborted', () => reject(new Error('ESP32 response aborted')));
  });

async function captureStill() {
  const attempted = [];
  for (const path of STILL_PATHS) {
    const url = `${baseUrl}${path}`;
    attempted.push(url);
    try {
      const res = await get(url, {
        connectTimeout: CONNECT_TIMEOUT_MS,
        inactivityTimeout: STILL_TIMEOUT_MS,
      });
      if (res.statusCode !== 200) {
        res.resume();
        continue;
      }
      const buf = await collect(res);
      if (isJpeg(buf)) return buf;
    } catch (e) {
      // try the next path
    }
  }
  throw esp32Error(`ESP32-CAM returned no JPEG still. Tried: ${attempted.join(', ')}`, { attempted });
}

/* =========================================================
   PUBLIC API
   ========================================================= */

/**
 * Attach a browser to the live MJPEG stream. Resolves after the response has
 * been taken over; rejects (headers untouched) if no frame could be obtained.
 */
async function subscribe(res) {
  state.want = true;
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }

  let first;
  try {
    await ensureUpstream();
    first = await waitForFrame(FRAME_TIMEOUT_MS);
  } catch (e) {
    // no viewer actually attached - don't leave a reconnect loop running
    releaseIfIdle();
    throw e;
  }

  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${STREAM_BOUNDARY}`,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'X-Accel-Buffering': 'no',
  });
  if (res.socket) res.socket.setNoDelay(true);

  const client = { res, busy: false, pending: null };
  state.clients.add(client);
  sendToClient(client, first);

  const cleanup = () => {
    state.clients.delete(client);
    if (!state.clients.size && !state.idleTimer) {
      // last viewer gone - keep the camera warm briefly, then release it
      state.idleTimer = setTimeout(() => {
        state.idleTimer = null;
        if (state.clients.size) return;
        releaseIfIdle();
        if (state.res) {
          const upstream = state.res;
          state.res = null;
          state.url = null;
          if (!upstream.destroyed) upstream.destroy();
        }
      }, IDLE_CLOSE_MS);
    }
  };

  res.on('close', cleanup);
  res.on('error', cleanup);
  return cleanup;
}

/** One JPEG for the face AI - served from the shared stream, no extra camera connection. */
async function getFrame(timeoutMs = FRAME_TIMEOUT_MS) {
  state.want = true;
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
  try {
    await ensureUpstream();
    return await waitForFrame(timeoutMs);
  } catch (e) {
    // camera without a stream? fall back to a still endpoint
    const still = await captureStill().catch(() => null);
    if (still) return still;
    releaseIfIdle();
    throw e;
  }
}

const frameAgeMs = () => (state.latestAt ? Date.now() - state.latestAt : null);

/** Full probe used by GET /health and the Start Camera button. */
async function healthCheck() {
  const u = new URL(baseUrl);
  const host = `${u.protocol}//${u.hostname}`;

  if (state.res && !state.res.destroyed) {
    return { base: baseUrl, host, online: true, stream: state.url, frameAgeMs: frameAgeMs() };
  }

  try {
    await ensureUpstream();
    await waitForFrame(FRAME_TIMEOUT_MS).catch(() => {});
    return { base: baseUrl, host, online: true, stream: state.url, frameAgeMs: frameAgeMs() };
  } catch (e) {
    // probe still endpoints in parallel for a clearer report
    const still = {};
    await Promise.all(
      STILL_PATHS.map(async (p) => {
        try {
          const res = await get(`${baseUrl}${p}`, { connectTimeout: CONNECT_TIMEOUT_MS });
          still[p] = res.statusCode === 200;
          res.destroy();
        } catch {
          still[p] = false;
        }
      })
    );
    const anyStill = Object.values(still).some(Boolean);
    return { base: baseUrl, host, online: anyStill, still, stream: null, error: e.message };
  }
}

/* =========================================================
   RUNTIME CAMERA ADDRESS
   ========================================================= */

const getBase = () => baseUrl;

/** Point the proxy at a new camera address (persisted for the next restart). */
function setBase(url) {
  const next = normalizeBase(url);
  if (!next) throw esp32Error('A valid camera URL is required');
  baseUrl = next;
  workingStreamUrl = null;
  try {
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify({ url: baseUrl, updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch {
    // persistence is best-effort; the runtime value still applies
  }
  // drop the current upstream so the next request connects to the new address
  if (state.res) dropUpstream(state.res);
  else if (state.want) ensureUpstream().catch(() => {});
  return baseUrl;
}

/* =========================================================
   NETWORK DISCOVERY - find the camera when its IP changes
   ========================================================= */

const tcpOpen = (host, port, timeoutMs = SCAN_CONNECT_TIMEOUT_MS) =>
  new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (open) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(open);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, host);
  });

const httpProbe = (url, timeoutMs = SCAN_HTTP_TIMEOUT_MS) =>
  new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return resolve(null);
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    let settled = false;
    let timer;
    const req = lib.get(url, (res) => {
      settled = true;
      clearTimeout(timer);
      const ct = String(res.headers['content-type'] || '').toLowerCase();
      let body = Buffer.alloc(0);
      res.on('data', (c) => {
        body = Buffer.concat([body, c]);
        if (body.length > 4096) res.destroy();
      });
      res.on('close', () =>
        resolve({ status: res.statusCode, contentType: ct, jpeg: body[0] === 0xff && body[1] === 0xd8 })
      );
      res.on('error', () => resolve({ status: res.statusCode, contentType: ct, jpeg: false }));
    });
    timer = setTimeout(() => {
      req.destroy();
      if (!settled) resolve(null);
    }, timeoutMs);
    req.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });

const localSubnets = () => {
  const subnets = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      if (ni.address.startsWith('169.254.')) continue; // link-local, never the camera
      const p = ni.address.split('.');
      subnets.add(`${p[0]}.${p[1]}.${p[2]}.`);
    }
  }
  return [...subnets];
};

/** Scan the backend host's local /24s for an ESP32-CAM (ports 80 & 81). */
async function scanNetwork() {
  const subnets = localSubnets();
  const hosts = [];
  for (const prefix of subnets) for (let i = 1; i <= 254; i++) hosts.push(`${prefix}${i}`);

  const open = [];
  const CONC = 128;
  for (let i = 0; i < hosts.length; i += CONC) {
    const batch = hosts.slice(i, i + CONC);
    const results = await Promise.all(batch.flatMap((ip) => [tcpOpen(ip, 80), tcpOpen(ip, 81)]));
    batch.forEach((ip, idx) => {
      if (results[idx * 2]) open.push({ ip, port: 80 });
      if (results[idx * 2 + 1]) open.push({ ip, port: 81 });
    });
  }

  const candidates = [];
  const seen = new Set();
  for (const o of open) {
    const base = `http://${o.ip}`;
    const probes = [];
    if (o.port === 80) probes.push(httpProbe(`${base}/capture`), httpProbe(`${base}/`));
    if (o.port === 81) probes.push(httpProbe(`${base}:81/stream`));
    const infos = (await Promise.all(probes)).filter(Boolean);
    const looksLikeCamera = infos.some(
      (x) => x.jpeg || x.contentType.includes('multipart') || x.contentType.startsWith('image/')
    );
    if (looksLikeCamera && !seen.has(base)) {
      seen.add(base);
      candidates.push({ url: base, ip: o.ip, port: o.port });
    }
  }

  return { current: baseUrl, subnets, scanned: hosts.length, openPorts: open, candidates };
}

/* =========================================================
   FRAME WATCHDOG
   A camera can lose wifi mid-stream without closing the TCP socket, leaving
   the video frozen forever. If no frame arrives for FRAME_TIMEOUT_MS while a
   stream is attached, drop it so the reconnect path kicks in.
   ========================================================= */

const watchdog = setInterval(() => {
  if (!state.want || !state.res || state.res.destroyed) return;
  const lastActivity = state.latestAt || state.attachedAt;
  if (lastActivity && Date.now() - lastActivity > FRAME_TIMEOUT_MS) {
    dropUpstream(state.res);
  }
}, 2000);
if (watchdog.unref) watchdog.unref();

module.exports = {
  subscribe,
  getFrame,
  healthCheck,
  captureStill,
  ensureUpstream,
  getBase,
  setBase,
  scanNetwork,
};
