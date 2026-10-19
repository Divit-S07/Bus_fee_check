const express = require('express');
const esp32 = require('../services/esp32.service');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

// helmet sets Cross-Origin-Resource-Policy: same-origin on every response;
// the SPA (<img> stream + fetch capture) lives on another origin, so override
// it here - same pattern as /uploads in server.js
router.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// GET /api/v1/esp32/health - probe every still + stream candidate
router.get('/health', async (req, res) => {
  try {
    const probe = await esp32.healthCheck();
    res.json({ esp32: probe.online ? 'online' : 'offline', ...probe });
  } catch (error) {
    res.status(502).json({
      esp32: 'offline',
      message: error.message,
      code: error.code || 'esp32_error',
    });
  }
});

// GET /api/v1/esp32/capture - one JPEG frame for the AI pipeline
// (served from the shared live stream, so it never fights the <img> for the
// camera's single connection)
router.get('/capture', async (req, res) => {
  try {
    const jpeg = await esp32.getFrame();
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Content-Length', String(jpeg.length));
    res.send(jpeg);
  } catch (error) {
    res.status(502).json({
      message: error.message,
      code: error.code || 'esp32_capture_failed',
      attempted: error.attempted,
    });
  }
});

// GET /api/v1/esp32/stream - live MJPEG to the browser, fanned out from the
// single shared camera connection
router.get('/stream', async (req, res) => {
  try {
    await esp32.subscribe(res); // takes over the response
  } catch (error) {
    if (!res.headersSent) {
      res.status(502).json({
        message: error.message,
        code: error.code || 'esp32_stream_failed',
        attempted: error.attempted,
      });
    } else {
      res.end();
    }
  }
});

// GET /api/v1/esp32/config - current camera address (any signed-in admin)
router.get('/config', authenticate, (req, res) => {
  res.json({ url: esp32.getBase() });
});

// POST /api/v1/esp32/config  { url } - set the camera address at runtime
// (persisted, so no backend/.env edit + restart is needed)
router.post('/config', authenticate, requireRole(['super_admin', 'admin']), (req, res) => {
  try {
    const url = esp32.setBase(req.body?.url);
    res.json({ url, message: 'Camera address updated' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// GET /api/v1/esp32/scan - discover the camera on the backend host's LAN
router.get('/scan', authenticate, requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const result = await esp32.scanNetwork();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
