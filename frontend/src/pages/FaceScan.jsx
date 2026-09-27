import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Avatar, Button, Card, Empty, List, Segmented, Select, Space, Spin, Tag, Tooltip, message,
} from 'antd';
import {
  CameraOutlined, CameraTwoTone, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined,
  RobotOutlined, ScanOutlined, StopOutlined, UserAddOutlined, UserOutlined, WarningOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const CONF = (c) => (typeof c === 'number' ? `${(c * 100).toFixed(1)}%` : '-');

const OutcomeIcon = ({ status }) => {
  if (status === 'paid_ignored') return <CheckCircleOutlined style={{ color: '#10b981' }} />;
  if (status === 'unpaid_recorded') return <WarningOutlined style={{ color: '#ef4444' }} />;
  if (status === 'registered') return <UserAddOutlined style={{ color: '#6366f1' }} />;
  return <CloseCircleOutlined style={{ color: '#f59e0b' }} />;
};

const FaceScan = () => {
  const [mode, setMode] = useState('scan');
  const [buses, setBuses] = useState([]);
  const [students, setStudents] = useState([]);
  const [busId, setBusId] = useState();
  const [registerStudentId, setRegisterStudentId] = useState();
  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [cameraError, setCameraError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    fetchBuses();
    fetchStudents();
    checkAi();
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAi = async () => {
    try {
      const res = await api.get('/face/health');
      setAi(res.data);
    } catch (e) {
      setAi({ ai: 'offline', message: e.message });
    }
  };

  const fetchBuses = async () => {
    try {
      const res = await api.get('/buses');
      setBuses(res.data || []);
      if (res.data?.length && !busId) setBusId(res.data[0]._id);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await api.get('/students');
      setStudents(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const startCamera = async () => {
    if (streamRef.current) return;
    setStarting(true);
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch (e) {
      setCameraError(`Camera unavailable: ${e.message}. Allow camera access and retry.`);
      setCameraOn(false);
    }
    setStarting(false);
  };

  const stopCamera = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const pushHistory = (entry) => setHistory((h) => [entry, ...h].slice(0, 8));

  const handleScan = async () => {
    const image = capture();
    if (!image) return message.warning('Start the camera first');
    if (!busId) return message.warning('Select the bus before scanning');
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post('/face/scan', { image, busId });
      const data = res.data;
      setResult(data);
      pushHistory({
        id: data.logId,
        time: new Date(),
        name: data.student ? `${data.student.firstName} ${data.student.lastName}`.trim() : 'Unknown face',
        status: data.status,
        confidence: data.confidence,
        detail: data.message,
      });
      if (data.status === 'unpaid_recorded') message.error(data.message);
      else if (data.status === 'paid_ignored') message.success(data.message);
      else message.warning(data.message);
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      setResult({ status: 'error', message: msg, matched: false });
      message.error(msg);
    }
    setBusy(false);
  };

  const handleRegister = async () => {
    const image = capture();
    if (!image) return message.warning('Start the camera first');
    if (!registerStudentId) return message.warning('Select the student to register');
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post(`/face/register/${registerStudentId}`, { image });
      const student = res.data.student;
      const entry = {
        status: 'registered',
        matched: true,
        student: {
          _id: student._id,
          studentId: student.studentId,
          firstName: student.firstName,
          lastName: student.lastName,
          photoUrl: student.photoUrl,
          paymentStatus: student.paymentStatus,
        },
        confidence: 1,
        message: `${student.firstName} ${student.lastName} face registered (${res.data.model})`,
      };
      setResult(entry);
      pushHistory({ id: student._id, time: new Date(), name: `${student.firstName} ${student.lastName}`, status: 'registered', confidence: 1, detail: entry.message });
      message.success(entry.message);
      fetchStudents();
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      setResult({ status: 'error', message: msg, matched: false });
      message.error(msg);
    }
    setBusy(false);
  };

  const aiOffline = ai && ai.ai === 'offline';

  const resultPanel = () => {
    if (busy) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin tip="Matching face..." />
        </div>
      );
    }
    if (!result) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No scan yet - face the camera and press Scan Face"
        />
      );
    }
    if (result.status === 'error') {
      return <Alert type="error" showIcon message="Scan failed" description={result.message} />;
    }
    const tone =
      result.status === 'paid_ignored' ? 'success'
        : result.status === 'unpaid_recorded' ? 'error'
          : result.status === 'registered' ? 'info'
            : 'warning';
    const title = {
      paid_ignored: 'Fee Paid - Boarding Allowed',
      unpaid_recorded: 'Unpaid Travel Recorded',
      registered: 'Face Registered',
      low_confidence: 'Face Not Confident Enough',
      unidentified: 'Unknown Face',
    }[result.status] || 'Scan Result';

    return (
      <Alert
        type={tone}
        showIcon
        icon={<OutcomeIcon status={result.status} />}
        message={title}
        description={
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {result.student && (
              <Space size={12}>
                <Avatar src={result.student.photoUrl} size={56} icon={<UserOutlined />} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {result.student.firstName} {result.student.lastName}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {result.student.studentId}
                    {result.student.busRoute ? ` · ${result.student.busRoute}` : ''}
                  </div>
                  <Space size={6} style={{ marginTop: 4 }}>
                    <Tag color={result.student.paymentStatus === 'paid' ? 'green' : 'red'}>
                      {(result.student.paymentStatus || 'unpaid').toUpperCase()}
                    </Tag>
                    {result.isRepeatOffense && <Tag color="volcano">Repeat offender</Tag>}
                  </Space>
                </div>
              </Space>
            )}
            <div>{result.message}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Confidence {CONF(result.confidence)}
              {result.threshold ? ` · threshold ${CONF(result.threshold)}` : ''}
              {result.repeatCount ? ` · unpaid trips ${result.repeatCount}` : ''}
              {result.model ? ` · ${result.model}` : ''}
            </div>
          </Space>
        }
      />
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Face Scan</h1>
          <div className="page-subtitle">
            Webcam boarding check powered by a local DeepFace model - runs free, entirely on this laptop
          </div>
        </div>
        <Space>
          <Tooltip title="Re-check the local AI service">
            <Button icon={<ReloadOutlined />} onClick={checkAi}>AI Status</Button>
          </Tooltip>
          {cameraOn ? (
            <Button danger icon={<StopOutlined />} onClick={stopCamera}>Stop Camera</Button>
          ) : (
            <Button type="primary" icon={<CameraOutlined />} onClick={startCamera}>Start Camera</Button>
          )}
        </Space>
      </div>

      {aiOffline && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Face AI service is offline"
          description={`${ai.message} - start it with: cd ai-service && python main.py`}
          action={<Button size="small" onClick={checkAi}>Retry</Button>}
        />
      )}
      {!aiOffline && ai && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={`AI online · model ${ai.model} · detector ${ai.detector} · threshold ${ai.threshold} · ${ai.deepface ? `deepface ${ai.deepface}` : ''}`}
        />
      )}
      {cameraError && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={cameraError} action={<Button size="small" onClick={startCamera}>Retry</Button>} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16 }}>
        <Card
          title={
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { label: <span><ScanOutlined /> Boarding Scan</span>, value: 'scan' },
                { label: <span><UserAddOutlined /> Register Face</span>, value: 'register' },
              ]}
            />
          }
          extra={<Tag color={cameraOn ? 'green' : 'default'}>{cameraOn ? 'LIVE' : 'OFFLINE'}</Tag>}
        >
          <div
            style={{
              position: 'relative', background: '#0f1117', borderRadius: 12, overflow: 'hidden',
              aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                transform: 'scaleX(-1)', display: cameraOn ? 'block' : 'none',
              }}
            />
            {!cameraOn && (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>
                <CameraTwoTone style={{ fontSize: 48 }} />
                <div style={{ marginTop: 8 }}>Camera is off</div>
              </div>
            )}
            <div
              style={{
                position: 'absolute', inset: '8% 22%', border: '2px dashed rgba(165,180,252,0.7)',
                borderRadius: '50%', pointerEvents: 'none',
              }}
            />
          </div>

          <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 14 }}>
            {mode === 'scan' ? (
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Bus</div>
                <Select
                  style={{ width: '100%' }}
                  placeholder="Select bus"
                  value={busId}
                  onChange={setBusId}
                  options={buses.map((b) => ({ value: b._id, label: `${b.busNumber}${b.routeName ? ` (${b.routeName})` : ''}` }))}
                />
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Student</div>
                <Select
                  showSearch
                  style={{ width: '100%' }}
                  placeholder="Select student to register"
                  value={registerStudentId}
                  onChange={setRegisterStudentId}
                  optionFilterProp="label"
                  options={students.map((s) => ({
                    value: s._id,
                    label: `${s.firstName} ${s.lastName} (${s.studentId})${s.faceRegistrationStatus === 'registered' ? ' - registered' : ''}`,
                  }))}
                />
              </div>
            )}

            <Button
              type="primary"
              size="large"
              block
              loading={busy}
              disabled={!cameraOn}
              icon={mode === 'scan' ? <ScanOutlined /> : <UserAddOutlined />}
              onClick={mode === 'scan' ? handleScan : handleRegister}
            >
              {mode === 'scan' ? 'Scan Face' : 'Register This Face'}
            </Button>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              {mode === 'scan'
                ? 'Matched + fee paid -> ignored · matched + fee unpaid -> travel stored as unpaid'
                : 'Captures one frame, stores a 128-d embedding for the selected student'}
            </div>
          </Space>
        </Card>

        <Space direction="vertical" size={16}>
          <Card title={<span><RobotOutlined /> Result</span>}>{resultPanel()}</Card>

          <Card title="Recent scans on this device" size="small">
            {history.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing scanned yet" />
            ) : (
              <List
                size="small"
                dataSource={history}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<OutcomeIcon status={item.status} />}
                      title={
                        <Space size={8} wrap>
                          <span>{item.name}</span>
                          <Tag>{item.time.toLocaleTimeString()}</Tag>
                          <Tag color={item.status === 'paid_ignored' ? 'green' : item.status === 'unpaid_recorded' ? 'red' : item.status === 'registered' ? 'blue' : 'orange'}>
                            {String(item.status).replace(/_/g, ' ')}
                          </Tag>
                          {typeof item.confidence === 'number' && <Tag>{CONF(item.confidence)}</Tag>}
                        </Space>
                      }
                      description={item.detail}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Space>
      </div>
    </div>
  );
};

export default FaceScan;
