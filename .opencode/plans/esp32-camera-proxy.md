# Plan: Show ESP32-CAM footage in the Bus Fee project

## Problem (diagnosis)

1. **CORS blocks face capture** - `FaceScan.jsx` called `fetch('http://10.67.1.56/capture')` directly from the browser (`localhost:5173`). ESP32 firmware sends no `Access-Control-Allow-Origin` header, so the browser blocks the response and `capture()` always returns `null`.
2. **Stream URL wrong** - `<img src="http://10.67.1.56:81/stream">` hardcodes port 81; the user's camera shows footage at `http://10.67.1.56/`. If the stream is elsewhere the `<img>` fails ("Cannot connect to ESP32-CAM stream").
3. **Stale capture URL** - `frontend/.env` sets `VITE_ESP32_CAM_URL=http://10.67.1.56/`, code appends `/capture` -> `http://10.67.1.56//capture` (works by luck) but any other value (e.g. `/photo`) breaks it.
4. **Helmet CORP** - backend `helmet()` sets `Cross-Origin-Resource-Policy: same-origin` on every response (already overridden for `/uploads`); proxied images need the same override or the browser blocks them.

## Solution: proxy the ESP32 through the Node backend

Backend has no CORS restriction and can reach `10.67.1.56` directly. Browser only talks to `localhost:5000`.

### 1. New `backend/services/esp32.service.js`

- `BASE` from `process.env.ESP32_CAM_URL` (default `http://10.67.1.56`), `ESP32_TIMEOUT_MS` (default 5000).
- Built-in `http`/`https` only - no new npm packages.
- Helper `get(url, timeoutMs)` - promise-wrapped GET with socket timeout (timer keeps running after headers so stalled streams are destroyed).
- Helper `collect(res, limit)` - buffers response with a size cap.
- **`captureStill()`** - tries still paths `/capture`, `/photo`, `/snapshot`, `/still`, `/jpg`, validates JPEG magic bytes (`FF D8`); fallback: opens the MJPEG stream and extracts the first `FF D8 ... FF D9` frame (`readFirstFrame`), then destroys it. Throws `esp32_offline` error listing every attempted endpoint.
- **`openStream()`** - tries stream candidates in order:
  1. `http://<ip>:81/stream` (AI-Thinker default)
  2. `http://<ip>/stream`
  3. `http://<ip>:81/video`
  4. `http://<ip>/video`
  5. `http://<ip>/` (firmware that streams at root)
  Returns first response whose content-type is `multipart/x-mixed-replace`, `multipart/related`, or `image/*`.
- **`healthCheck()`** - probes all still + stream candidates, returns `{ base, still: {...}, stream: {...}, online }`.

### 2. New `backend/routes/esp32.routes.js` (public, like `face/health`)

- Middleware `allowCrossOrigin` sets `Cross-Origin-Resource-Policy: cross-origin` (same pattern as `/uploads` in `server.js`).
- `GET /health` -> JSON probe result (`esp32: online|offline` + per-endpoint booleans).
- `GET /capture` -> `captureStill()`; responds `image/jpeg`, `Cache-Control: no-store`, CORP override; on `esp32_offline` respond `502 { message, code }`.
- `GET /stream` -> `openStream()`, pipes upstream to client with forwarded `Content-Type`, `no-store` cache headers, `X-Accel-Buffering: no`, CORP override; destroys upstream on client close; `502` JSON if no candidate works.

### 3. Wire-up

- `backend/routes/index.js`: `router.use('/esp32', esp32Routes);`
- `backend/.env` + `backend/.env.example`: add `ESP32_CAM_URL=http://10.67.1.56` (comment: IP of the ESP32 camera).
- `backend/server.js` rate limiter: extend `skip` to also skip
  `/api/v1/esp32/health`, `/api/v1/esp32/capture`, `/api/v1/esp32/stream`
  (auto-scan polls capture ~1/sec; stream is one long-lived request).

### 4. Frontend `frontend/src/pages/FaceScan.jsx`

- Move `API_ORIGIN` definition to the ESP32 settings block (top), then:
  ```js
  const ESP32_STREAM_URL = `${API_ORIGIN}/api/v1/esp32/stream`;
  const ESP32_CAPTURE_URL = `${API_ORIGIN}/api/v1/esp32/capture`;
  const ESP32_HEALTH_URL  = `${API_ORIGIN}/api/v1/esp32/health`;
  ```
  Delete `ESP32_CAM_URL` / `VITE_ESP32_CAM_URL` / `VITE_ESP32_CAM_STREAM_URL` usage (remove duplicate `API_ORIGIN` const declared later - it would be a redeclaration syntax error).
- `capture()` - `fetch(ESP32_CAPTURE_URL, { cache: 'no-store' })` (same-origin -> no CORS issue); rest of canvas downscale logic unchanged.
- New `startCamera()` used by the Start Camera button:
  - clears error, sets `cameraOn(true)`
  - fetches `ESP32_HEALTH_URL`; if `esp32 !== 'online'` show banner: "ESP32-CAM not reachable - check power / ESP32_CAM_URL in backend/.env"
  - fetch failure -> "Cannot reach backend proxy - is the Node server running?"
- `<img>` `onError` message -> point user at `/api/v1/esp32/health` for debugging.

### 5. Frontend env cleanup

- `frontend/.env`: remove stale `VITE_ESP32_CAM_URL` / `VITE_ESP32_CAM_STREAM_URL` (camera IP now lives in `backend/.env`).
- `frontend/.env.example`: remove the ESP32 line, note that the camera URL is configured in `backend/.env` (`ESP32_CAM_URL`).

## Part B: ESP32 image quality / framing (firmware settings - no code)

The "zoomed in" look comes from the ESP32's stream resolution/aspect not matching the
4:3 camera panel (panel uses `objectFit: cover`, which crops to fill). Configured on the
camera's own page, not in project code:

1. Open `http://10.67.1.56/` in the browser.
2. In the settings panel:
   - **Resolution** - pick a 4:3 mode so nothing gets cropped in the panel:
     `VGA 640x480` (fastest, recommended for scanning) or `SVGA 800x600` / `XGA 1024x768`
     (sharper, slower capture). Avoid 16:9 modes if the frame looks cut off.
   - **Quality** - lower number = sharper (try `4`-`10`); high values (near 63) look
     blurry/over-compressed.
   - Save / Set so the values persist.
3. Restart the stream (reload the page or click Start Camera in the project) - the new
   settings apply immediately, no project restart needed.

Optional (only if in-app control is wanted later): forward the firmware's control
endpoint through the proxy (`/api/v1/esp32/control?var=...&val=...` -> ESP32 `/control`)
and add resolution/quality selects to the Face Scan card. Not part of the base plan.

## Verification (user runs manually)

```bash
# 1. restart backend
cd backend && npm run dev
# 2. debug probe (browser) - shows which endpoints the camera answers
#    http://localhost:5000/api/v1/esp32/health
# 3. restart frontend (picks up new code)
cd frontend && npm run dev
# 4. open Face Scan -> Start Camera
```

Expected: live ESP32 footage in the camera panel; auto-scan detects faces; `capture()` returns frames for `/face/detect`, `/face/scan`, `/face/register`.

## Files touched

| File | Action |
|---|---|
| `backend/services/esp32.service.js` | create |
| `backend/routes/esp32.routes.js` | create |
| `backend/routes/index.js` | register `/esp32` |
| `backend/server.js` | rate-limit `skip` |
| `backend/.env`, `backend/.env.example` | add `ESP32_CAM_URL` |
| `frontend/src/pages/FaceScan.jsx` | proxy URLs + health check |
| `frontend/.env`, `frontend/.env.example` | remove stale ESP32 vars |

No changes to ai-service, face endpoints, or any npm dependencies.
