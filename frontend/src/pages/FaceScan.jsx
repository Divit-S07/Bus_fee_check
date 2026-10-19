import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Empty,
  Input,
  List,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  message,
} from 'antd';

import {
  CameraOutlined,
  CameraTwoTone,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  ScanOutlined,
  StopOutlined,
  UserAddOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';

import api from '../api/client';

/* =========================================================
   ESP32-CAM SETTINGS

   The camera is proxied by the Node backend (/api/v1/esp32/*) - the
   browser never talks to the ESP32 directly (CORS + mixed endpoints).
   Camera IP lives in backend/.env as ESP32_CAM_URL.
   ========================================================= */

const API_ORIGIN =
  (import.meta.env.VITE_API_URL || '')
    .replace(/\/api\/v1\/?$/, '');

const ESP32_STREAM_URL = `${API_ORIGIN}/api/v1/esp32/stream`;
const ESP32_CAPTURE_URL = `${API_ORIGIN}/api/v1/esp32/capture`;
const ESP32_HEALTH_URL = `${API_ORIGIN}/api/v1/esp32/health`;

/* =========================================================
   IMAGE / SCAN SETTINGS
   ========================================================= */

const MAX_FRAME_W = 960;
const DETECT_FRAME_W = 640;

const SCAN_FRAMES = 3;
const FRAME_GAP_MS = 140;

const DETECT_MS = 1000;
const REARM_TICKS = 2;
const SCAN_COOLDOWN_MS = 5000;

const AUTO_LABEL = {
  off: 'Automatic scanning is off',
  looking: 'Looking for a face - just look at the camera',
  waiting: 'Person seen - waiting for them to leave before the next scan',
  scanning: 'Face detected - scanning...',
};

const wait = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* =========================================================
   HELPERS
   ========================================================= */

const CONF = (c) =>
  typeof c === 'number'
    ? `${(c * 100).toFixed(1)}%`
    : '-';

const mediaUrl = (url) =>
  !url
    ? ''
    : /^https?:/i.test(url)
      ? url
      : `${API_ORIGIN}${url}`;

/* =========================================================
   ICON
   ========================================================= */

const OutcomeIcon = ({ status }) => {
  if (status === 'paid_ignored') {
    return (
      <CheckCircleOutlined
        style={{ color: '#10b981' }}
      />
    );
  }

  if (status === 'unpaid_recorded') {
    return (
      <WarningOutlined
        style={{ color: '#ef4444' }}
      />
    );
  }

  if (status === 'registered') {
    return (
      <UserAddOutlined
        style={{ color: '#6366f1' }}
      />
    );
  }

  return (
    <CloseCircleOutlined
      style={{ color: '#f59e0b' }}
    />
  );
};

/* =========================================================
   FACE SCAN COMPONENT
   ========================================================= */

const FaceScan = () => {
  const [mode, setMode] = useState('scan');

  const [buses, setBuses] = useState([]);
  const [students, setStudents] = useState([]);

  const [busId, setBusId] = useState();
  const [registerStudentId, setRegisterStudentId] =
    useState();

  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const [ai, setAi] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const [cameraError, setCameraError] =
    useState('');

  // bumped to remount the <img> when reconnecting to the proxy
  const [streamKey, setStreamKey] = useState(0);
  const streamRetryRef = useRef(null);

  // camera address controls (ESP32-CAM IP can change - no .env edit needed)
  const [cameraUrl, setCameraUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraMsg, setCameraMsg] = useState('');

  /* =======================================================
     REFS
     ======================================================= */

  const armedRef = useRef(true);
  const absentRef = useRef(0);
  const cooldownRef = useRef(0);
  const busyRef = useRef(false);
  const hintRef = useRef(false);
  const errorRef = useRef(0);

  const [auto, setAuto] = useState('off');

  /* =======================================================
     INITIAL LOAD
     ======================================================= */

  useEffect(() => {
    fetchBuses();
    fetchStudents();
    checkAi();
    loadCameraConfig();
  }, []);

  /* =======================================================
     CAMERA ADDRESS (runtime config + LAN discovery)
     ======================================================= */

  const loadCameraConfig = async () => {
    try {
      const res = await api.get('/esp32/config');
      setCameraUrl(res.data?.url || '');
    } catch (e) {
      // non-fatal - the field just stays empty
    }
  };

  const findCamera = async () => {
    setScanning(true);
    setCameraMsg('');
    try {
      const res = await api.get('/esp32/scan');
      const found = res.data?.candidates || [];
      if (found.length === 1) {
        setCameraUrl(found[0].url);
        setCameraMsg(`Found camera at ${found[0].url} - click Apply.`);
      } else if (found.length > 1) {
        setCameraUrl(found[0].url);
        setCameraMsg(
          `Found ${found.length} candidates: ${found.map((c) => c.url).join(', ')} - using ${found[0].url}. Click Apply.`
        );
      } else {
        setCameraMsg('No camera found on the local network. Check power / Wi-Fi.');
      }
    } catch (e) {
      setCameraMsg(e.response?.data?.message || e.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const applyCamera = async () => {
    setCameraMsg('');
    setCameraError('');
    try {
      const res = await api.post('/esp32/config', { url: cameraUrl });
      setCameraUrl(res.data?.url || cameraUrl);
      setCameraMsg(`Camera set to ${res.data?.url}. Reconnecting…`);
      if (cameraOn) {
        setStreamLoading(true);
        setStreamReady(false);
        setStreamKey((k) => k + 1);
      }
    } catch (e) {
      setCameraMsg(e.response?.data?.message || e.message || 'Could not set camera');
    }
  };

  /* =======================================================
     AI STATUS
     ======================================================= */

  const checkAi = async () => {
    try {
      const res = await api.get('/face/health');

      setAi(res.data);
    } catch (e) {
      setAi({
        ai: 'offline',
        message: e.message,
      });
    }
  };

  /* =======================================================
     BUS DATA
     ======================================================= */

  const fetchBuses = async () => {
    try {
      const res = await api.get('/buses');

      setBuses(res.data || []);

      if (res.data?.length && !busId) {
        setBusId(res.data[0]._id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  /* =======================================================
     STUDENT DATA
     ======================================================= */

  const fetchStudents = async () => {
    try {
      const res = await api.get('/students');

      setStudents(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  /* =======================================================
     CAPTURE A SINGLE FRAME
     
     IMPORTANT:
     We DO NOT fetch /stream here.

     /stream is MJPEG and is only used by the <img>.
     
     For AI capture we use the ESP32-CAM still endpoint.
     ======================================================= */

  const capture = async (
    maxWidth = MAX_FRAME_W
  ) => {
    try {
      /*
       * Backend proxy - tries every still endpoint on the ESP32 and
       * falls back to grabbing one frame off the MJPEG stream.
       */
      const response = await fetch(
        `${ESP32_CAPTURE_URL}?t=${Date.now()}`,
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        const detail = await response
          .json()
          .catch(() => null);

        console.warn(
          'ESP32 capture failed:',
          detail?.message || response.status
        );

        return null;
      }

      const blob = await response.blob();

      const objectUrl =
        URL.createObjectURL(blob);

      const img = new Image();

      const imageLoaded = new Promise(
        (resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        }
      );

      img.src = objectUrl;

      await imageLoaded;

      const scale = Math.min(
        1,
        maxWidth / img.width
      );

      const canvas =
        document.createElement('canvas');

      canvas.width = Math.max(
        1,
        Math.round(img.width * scale)
      );

      canvas.height = Math.max(
        1,
        Math.round(img.height * scale)
      );

      const context =
        canvas.getContext('2d');

      context.drawImage(
        img,
        0,
        0,
        canvas.width,
        canvas.height
      );

      URL.revokeObjectURL(objectUrl);

      return canvas.toDataURL(
        'image/jpeg',
        0.82
      );
    } catch (e) {
      console.error(
        'ESP32 capture error:',
        e
      );

      return null;
    }
  };

  /* =======================================================
     CAPTURE MULTIPLE FRAMES
     ======================================================= */

  const captureFrames = async (
    count = SCAN_FRAMES
  ) => {
    const frames = [];

    for (let i = 0; i < count; i += 1) {
      const frame = await capture();

      if (frame) {
        frames.push(frame);
      }

      if (i < count - 1) {
        await wait(FRAME_GAP_MS);
      }
    }

    return frames;
  };

  /* =======================================================
     HISTORY
     ======================================================= */

  const pushHistory = (entry) => {
    setHistory((history) => [
      entry,
      ...history,
    ].slice(0, 8));
  };

  /* =======================================================
     FACE SCAN
     ======================================================= */

  const runScan = async (images) => {
    if (!images || !images.length) {
      return;
    }

    if (!busId) {
      message.warning(
        'Select the bus before scanning'
      );

      return;
    }

    setBusy(true);
    setResult(null);

    try {
      const res = await api.post(
        '/face/scan',
        {
          images,
          busId,
        }
      );

      const data = res.data;

      setResult(data);

      pushHistory({
        id: data.logId,
        time: new Date(),
        name:
          data.student
            ? `${data.student.firstName} ${data.student.lastName}`.trim()
            : 'Unknown face',

        status: data.status,

        confidence:
          data.confidence,

        frames:
          data.frames,

        framesTotal:
          data.framesTotal,

        detail:
          data.message,
      });

      if (
        data.status ===
        'unpaid_recorded'
      ) {
        message.error(data.message);
      } else if (
        data.status ===
        'paid_ignored'
      ) {
        message.success(data.message);
      } else {
        message.warning(data.message);
      }
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message;

      setResult({
        status: 'error',
        message: msg,
        matched: false,
      });

      message.error(msg);
    }

    setBusy(false);
  };

  /* =======================================================
     REGISTER FACE
     ======================================================= */

  const handleRegister = async () => {
    if (!cameraOn) {
      return message.warning(
        'Start the camera first'
      );
    }

    if (!registerStudentId) {
      return message.warning(
        'Select the student to register'
      );
    }

    setBusy(true);
    setResult(null);

    try {
      const images =
        await captureFrames(
          SCAN_FRAMES
        );

      if (!images.length) {
        setBusy(false);

        return message.warning(
          'Could not capture a frame'
        );
      }

      const res = await api.post(
        `/face/register/${registerStudentId}`,
        {
          images,
        }
      );

      const student =
        res.data.student;

      const entry = {
        status: 'registered',
        matched: true,

        student: {
          _id: student._id,
          studentId: student.studentId,
          firstName: student.firstName,
          lastName: student.lastName,
          photoUrl: student.photoUrl,
          paymentStatus:
            student.paymentStatus,
        },

        confidence: 1,

        message:
          `${student.firstName} ${student.lastName} face registered`,
      };

      setResult(entry);

      pushHistory({
        id: student._id,
        time: new Date(),

        name:
          `${student.firstName} ${student.lastName}`,

        status: 'registered',

        confidence: 1,

        detail: entry.message,
      });

      message.success(
        entry.message
      );

      fetchStudents();
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message;

      setResult({
        status: 'error',
        message: msg,
        matched: false,
      });

      message.error(msg);
    }

    setBusy(false);
  };

  /* =======================================================
      CAMERA + ESP32 HEALTH
      ======================================================= */

  // asks the backend which ESP32 endpoints answer and turns the
  // probe into a human-readable message
  const probeCamera = async () => {
    try {
      const res = await fetch(ESP32_HEALTH_URL, {
        cache: 'no-store',
      });

      const probe = await res.json().catch(() => null);

      if (probe?.esp32 === 'online') {
        return '';
      }

      const stillOk = probe?.still
        ? Object.entries(probe.still)
            .filter(([, ok]) => ok)
            .map(([path]) => path)
        : [];

      return (
        `ESP32-CAM offline at ${probe?.base || 'camera'} - ` +
        (stillOk.length
          ? `still endpoints ok but no stream (${stillOk.join(', ')})`
          : 'no still or stream endpoint responded') +
        '. Check power / ESP32_CAM_URL in backend/.env'
      );
    } catch {
      return 'Cannot reach backend proxy - is the Node server running?';
    }
  };

  const startCamera = () => {
    if (streamRetryRef.current) {
      clearTimeout(streamRetryRef.current);
      streamRetryRef.current = null;
    }

    setCameraError('');
    setStreamKey((k) => k + 1);
    setCameraOn(true);

    // Non-blocking health probe: checks camera in background without delaying video display
    probeCamera().then((err) => {
      if (err) setCameraError(err);
    });
  };

  // the <img> died mid-stream - show a brief message then auto-reconnect
  const handleStreamError = () => {
    setCameraError('Camera stream interrupted. Reconnecting in 3 seconds...');

    if (streamRetryRef.current) clearTimeout(streamRetryRef.current);
    streamRetryRef.current = setTimeout(() => {
      streamRetryRef.current = null;
      setStreamKey((k) => k + 1);
      setCameraError('');
    }, 3000);
  };

  // Clean up retry timer when camera is turned off
  const stopCamera = () => {
    if (streamRetryRef.current) {
      clearTimeout(streamRetryRef.current);
      streamRetryRef.current = null;
    }
    setCameraOn(false);
    setCameraError('');
  };

  /* =======================================================
      AI STATUS
      ======================================================= */

  const aiOffline =
    ai && ai.ai === 'offline';

  const aiReady =
    !!ai && !aiOffline;

  /* =======================================================
     AUTOMATIC FACE DETECTION
     ======================================================= */

  useEffect(() => {
    if (
      !cameraOn ||
      mode !== 'scan' ||
      !aiReady
    ) {
      setAuto('off');

      return undefined;
    }

    let stopped = false;

    armedRef.current = true;
    absentRef.current = 0;
    errorRef.current = 0;

    setAuto('looking');

    const tick = async () => {
      if (
        stopped ||
        busyRef.current
      ) {
        return;
      }

      if (!busId) {
        setAuto('looking');

        if (!hintRef.current) {
          hintRef.current = true;

          message.warning(
            'Select a bus'
          );
        }

        return;
      }

      busyRef.current = true;

      try {
        const frame =
          await capture(
            DETECT_FRAME_W
          );

        if (!frame) {
          return;
        }

        const res =
          await api.post(
            '/face/detect',
            {
              image: frame,
            }
          );

        const present =
          Number(
            res.data?.face_count
          ) > 0;

        if (!present) {
          // No face detected – clear previous result to prevent showing old face data
          setResult(null);
          absentRef.current += 1;

          if (
            absentRef.current >=
            REARM_TICKS
          ) {
            armedRef.current = true;

            setAuto('looking');
          } else {
            setAuto('waiting');
          }

          return;
        }

        absentRef.current = 0;

        if (
          !armedRef.current ||
          Date.now() <
            cooldownRef.current
        ) {
          setAuto('waiting');

          return;
        }

        armedRef.current = false;

        cooldownRef.current =
          Date.now() +
          SCAN_COOLDOWN_MS;

        setAuto('scanning');

        const frames =
          await captureFrames(
            SCAN_FRAMES
          );

        await runScan(frames);

        errorRef.current = 0;
      } catch (e) {
        errorRef.current += 1;

        if (
          errorRef.current >= 3
        ) {
          stopped = true;

          setAuto('off');

          setAi({
            ai: 'offline',
            message:
              e.response?.data?.message ||
              e.message,
          });
        }
      } finally {
        busyRef.current = false;
      }
    };

    const id = setInterval(
      tick,
      DETECT_MS
    );

    tick();

    return () => {
      stopped = true;

      clearInterval(id);
    };
  }, [
    cameraOn,
    mode,
    busId,
    aiReady,
  ]);

  /* =======================================================
     RESULT PANEL
     ======================================================= */

  const resultPanel = () => {
    if (busy) {
      return (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 0',
          }}
        >
          <Spin tip="Matching face..." />
        </div>
      );
    }

    if (!result) {
      return (
        <Empty
          image={
            Empty.PRESENTED_IMAGE_SIMPLE
          }
          description={
            'No scan yet - face the camera'
          }
        />
      );
    }

    if (result.status === 'error') {
      return (
        <Alert
          type="error"
          showIcon
          message="Scan failed"
          description={
            result.message
          }
        />
      );
    }

    const tone =
      result.status ===
      'paid_ignored'
        ? 'success'
        : result.status ===
          'unpaid_recorded'
          ? 'error'
          : result.status ===
            'registered'
            ? 'info'
            : 'warning';

    const title = {
      paid_ignored:
        'Fee Paid - Boarding Allowed',

      unpaid_recorded:
        'Unpaid Travel Recorded',

      registered:
        'Face Registered',

      low_confidence:
        'Person Not Found',

      unidentified:
        'Person Not Found',
    }[result.status] ||
      'Scan Result';

    return (
      <Alert
        type={tone}
        showIcon
        icon={
          <OutcomeIcon
            status={result.status}
          />
        }
        message={title}
        description={
          <Space
            direction="vertical"
            size={8}
            style={{
              width: '100%',
            }}
          >
            {result.student && (
              <Space size={12}>
                <Avatar
                  src={
                    result.student.photoUrl
                  }
                  size={56}
                  icon={
                    <UserOutlined />
                  }
                />

                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {
                      result.student
                        .firstName
                    }{' '}
                    {
                      result.student
                        .lastName
                    }
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.8,
                    }}
                  >
                    {
                      result.student
                        .studentId
                    }
                  </div>

                  <Tag
                    color={
                      result.student
                        .paymentStatus ===
                      'paid'
                        ? 'green'
                        : 'red'
                    }
                  >
                    {(
                      result.student
                        .paymentStatus ||
                      'unpaid'
                    ).toUpperCase()}
                  </Tag>
                </div>
              </Space>
            )}

            <div>
              {result.message}
            </div>

            <div
              style={{
                fontSize: 12,
                opacity: 0.75,
              }}
            >
              Confidence{' '}
              {CONF(
                result.confidence
              )}
            </div>
          </Space>
        }
      />
    );
  };

  /* =======================================================
     UI
     ======================================================= */

  return (
    <div>
      {/* HEADER */}

      <div className="page-header">
        <div>
          <h1>Face Scan</h1>

          <div className="page-subtitle">
            ESP32 CAM boarding check
          </div>
        </div>

        <Space>
          <Tooltip title="Check AI service">
            <Button
              icon={
                <ReloadOutlined />
              }
              onClick={checkAi}
            >
              AI Status
            </Button>
          </Tooltip>

          {cameraOn ? (
            <Button
              danger
              icon={
                <StopOutlined />
              }
              onClick={stopCamera}
            >
              Stop Camera
            </Button>
          ) : (
            <Button
              type="primary"
              icon={
                <CameraOutlined />
              }
              onClick={startCamera}
            >
              Start Camera
            </Button>
          )}
        </Space>
      </div>

      {/* AI STATUS */}

      {aiOffline && (
        <Alert
          type="error"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Face AI service is offline"
          description={
            ai.message
          }
        />
      )}

      {!aiOffline && ai && (
        <Alert
          type="success"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message={`AI online · model ${ai.model}`}
        />
      )}

      {cameraError && (
        <Alert
          type="warning"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message={cameraError}
          action={
            cameraOn ? (
              <Button
                size="small"
                onClick={startCamera}
              >
                Retry stream
              </Button>
            ) : null
          }
        />
      )}

      {/* MAIN */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 16,
        }}
      >
        {/* CAMERA */}

        <Card
          title={
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                {
                  label: (
                    <span>
                      <ScanOutlined />{' '}
                      Boarding Scan
                    </span>
                  ),
                  value: 'scan',
                },
                {
                  label: (
                    <span>
                      <UserAddOutlined />{' '}
                      Register Face
                    </span>
                  ),
                  value: 'register',
                },
              ]}
            />
          }
          extra={
            <Tag
              color={
                cameraOn
                  ? 'green'
                  : 'default'
              }
            >
              {cameraOn
                ? 'LIVE'
                : 'OFFLINE'}
            </Tag>
          }
        >
          {/* =================================================
              LIVE ESP32-CAM VIDEO
              ================================================= */}

          <div
            style={{
              position: 'relative',
              background: '#0f1117',
              borderRadius: 12,
              overflow: 'hidden',
              aspectRatio: '4 / 3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: cameraOn
                ? '2px solid #3b82f6'
                : '2px dashed rgba(165,180,252,0.7)',
            }}
          >
            {/* Live ESP32-CAM MJPEG Stream */}
            {cameraOn && (
              <img
                key={streamKey}
                src={`${ESP32_STREAM_URL}?t=${streamKey}`}
                alt="ESP32-CAM Live Stream"
                onError={handleStreamError}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            )}

            {/* Camera-off placeholder */}
            {!cameraOn && (
              <div
                style={{
                  color: '#94a3b8',
                  textAlign: 'center',
                  padding: 20,
                }}
              >
                <CameraTwoTone
                  style={{
                    fontSize: 48,
                  }}
                />

                <div
                  style={{
                    marginTop: 8,
                  }}
                >
                  Camera is off
                </div>
              </div>
            )}

            {/* Real-time Face Detection Guide Oval and Status Pill */}
            {cameraOn && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    inset: '8% 22%',
                    border: `2px ${
                      auto === 'scanning'
                        ? 'solid #06b6d4'
                        : result?.status === 'paid_ignored'
                        ? 'solid #10b981'
                        : result?.status === 'unpaid_recorded'
                        ? 'solid #ef4444'
                        : result?.status === 'low_confidence' || result?.status === 'unidentified'
                        ? 'solid #f59e0b'
                        : 'dashed rgba(165,180,252,0.8)'
                    }`,
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    boxShadow:
                      auto === 'scanning'
                        ? '0 0 20px rgba(6, 182, 212, 0.5)'
                        : result?.status === 'paid_ignored'
                        ? '0 0 20px rgba(16, 185, 129, 0.5)'
                        : result?.status === 'unpaid_recorded'
                        ? '0 0 20px rgba(239, 68, 68, 0.5)'
                        : 'none',
                    transition: 'all 0.3s ease',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(4px)',
                    color:
                      auto === 'scanning'
                        ? '#38bdf8'
                        : result?.status === 'paid_ignored'
                        ? '#34d399'
                        : result?.status === 'unpaid_recorded'
                        ? '#f87171'
                        : '#e2e8f0',
                    padding: '4px 14px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    pointerEvents: 'none',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        auto === 'scanning'
                          ? '#38bdf8'
                          : result?.status === 'paid_ignored'
                          ? '#34d399'
                          : result?.status === 'unpaid_recorded'
                          ? '#f87171'
                          : '#94a3b8',
                      display: 'inline-block',
                    }}
                  />
                  {auto === 'scanning'
                    ? 'Scanning face...'
                    : auto === 'waiting'
                    ? 'Person seen'
                    : result?.student
                    ? `${result.student.firstName} ${result.student.lastName}`
                    : 'Looking for a face...'}
                </div>
              </>
            )}
          </div>

          {/* BUS SELECT */}

          <Space
            direction="vertical"
            size={12}
            style={{
              width: '100%',
              marginTop: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  marginBottom: 6,
                }}
              >
                Camera address (ESP32-CAM)
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  value={cameraUrl}
                  onChange={(e) => setCameraUrl(e.target.value)}
                  placeholder="http://192.168.1.50"
                  allowClear
                />
                <Button
                  onClick={findCamera}
                  loading={scanning}
                  icon={<ReloadOutlined />}
                >
                  Find camera
                </Button>
                <Button
                  type="primary"
                  onClick={applyCamera}
                  disabled={!cameraUrl}
                >
                  Apply
                </Button>
              </Space.Compact>
              {cameraMsg && (
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 6,
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {cameraMsg}
                </div>
              )}
            </div>

            {mode === 'scan' ? (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  Bus
                </div>

                <Select
                  style={{
                    width: '100%',
                  }}
                  placeholder="Select bus"
                  value={busId}
                  onChange={
                    setBusId
                  }
                  options={buses.map(
                    (b) => ({
                      value: b._id,
                      label:
                        `${b.busNumber}${
                          b.routeName
                            ? ` (${b.routeName})`
                            : ''
                        }`,
                    })
                  )}
                />
              </div>
            ) : (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  Student
                </div>

                <Select
                  showSearch
                  style={{
                    width: '100%',
                  }}
                  placeholder="Select student"
                  value={
                    registerStudentId
                  }
                  onChange={
                    setRegisterStudentId
                  }
                  optionFilterProp="label"
                  options={students.map(
                    (s) => ({
                      value: s._id,
                      label:
                        `${s.firstName} ${s.lastName} (${s.studentId})`,
                    })
                  )}
                />
              </div>
            )}

            {/* AUTO STATUS */}

            {mode === 'scan' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent:
                    'center',
                  gap: 10,
                  minHeight: 44,
                  padding:
                    '10px 12px',
                  borderRadius: 10,
                  textAlign: 'center',
                  background:
                    auto ===
                    'scanning'
                      ? 'rgba(99,102,241,0.10)'
                      : 'rgba(16,185,129,0.10)',
                }}
              >
                {auto ===
                'scanning' ? (
                  <Spin
                    size="small"
                  />
                ) : (
                  <CameraOutlined
                    style={{
                      color:
                        '#10b981',
                    }}
                  />
                )}

                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {
                    AUTO_LABEL[
                      auto
                    ]
                  }
                </span>
              </div>
            ) : (
              <Button
                type="primary"
                size="large"
                block
                loading={busy}
                disabled={
                  !cameraOn ||
                  !registerStudentId
                }
                icon={
                  <UserAddOutlined />
                }
                onClick={
                  handleRegister
                }
              >
                Register This Face
              </Button>
            )}

            <div
              style={{
                fontSize: 12,
                color:
                  'var(--color-text-secondary)',
                textAlign: 'center',
              }}
            >
              {mode === 'scan'
                ? 'Automatic face scanning is enabled'
                : 'Captures multiple frames for registration'}
            </div>
          </Space>
        </Card>

        {/* RESULT */}

        <Space
          direction="vertical"
          size={16}
          style={{
            width: '100%',
          }}
        >
          <Card
            title={
              <span>
                <RobotOutlined /> Result
              </span>
            }
          >
            {resultPanel()}
          </Card>

          {/* HISTORY */}

          <Card
            title="Recent scans"
            size="small"
          >
            {history.length === 0 ? (
              <Empty
                image={
                  Empty.PRESENTED_IMAGE_SIMPLE
                }
                description="Nothing scanned yet"
              />
            ) : (
              <List
                size="small"
                dataSource={history}
                renderItem={
                  (item) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          <OutcomeIcon
                            status={
                              item.status
                            }
                          />
                        }
                        title={
                          <Space
                            size={8}
                            wrap
                          >
                            <span>
                              {
                                item.name
                              }
                            </span>

                            <Tag>
                              {item.time.toLocaleTimeString()}
                            </Tag>

                            <Tag>
                              {String(
                                item.status
                              ).replace(
                                /_/g,
                                ' '
                              )}
                            </Tag>
                          </Space>
                        }
                        description={
                          item.detail
                        }
                      />
                    </List.Item>
                  )
                }
              />
            )}
          </Card>
        </Space>
      </div>
    </div>
  );
};

export default FaceScan;