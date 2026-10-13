import React, { useState, useEffect } from 'react';
import { Table, DatePicker, Select, Button, Image, Tag, message } from 'antd';
import { ReloadOutlined, QuestionCircleOutlined, UserOutlined } from '@ant-design/icons';
import api from '../api/client';

const { RangePicker } = DatePicker;

const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/api\/v1\/?$/, '');
const mediaUrl = (url) => (!url ? '' : /^https?:/i.test(url) ? url : `${API_ORIGIN}${url}`);

const formatTimestamp = (ts) => {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return ts; }
};

// The JWT travels in an axios header, so <img src="..."> cannot reach the photo
// endpoint - fetch the bytes as a blob and hand antd <Image> an object URL
// (which also gives us the click-to-zoom preview for free).
const FacePhoto = ({ logId, fallbackUrl }) => {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    (async () => {
      try {
        const res = await api.get(`/face/unknown/${logId}/image`, { responseType: 'blob' });
        if (!alive) return;
        objectUrl = URL.createObjectURL(res.data);
        setSrc(objectUrl);
      } catch (e) {
        if (alive && fallbackUrl) setSrc(mediaUrl(fallbackUrl));
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [logId, fallbackUrl]);

  if (!src) {
    return (
      <div
        style={{
          width: 56, height: 56, borderRadius: 10, background: '#f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8',
        }}
      >
        <UserOutlined />
      </div>
    );
  }

  return (
    <Image
      src={src}
      width={56}
      height={56}
      alt="Unknown face"
      style={{ objectFit: 'cover', borderRadius: 10, border: '1px solid var(--color-border)' }}
    />
  );
};

const UnknownFaces = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [today, setToday] = useState(0);
  const [filters, setFilters] = useState({ page: 1, limit: 12 });

  useEffect(() => { fetchUnknown(); }, [filters]);

  const fetchUnknown = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(
        Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ''))
      ).toString();
      const res = await api.get(`/face/unknown?${params}`);
      setRows(res.data.data || []);
      setTotal(res.data.total || 0);
      setToday(res.data.today || 0);
    } catch (e) {
      message.error('Failed to fetch unknown faces');
    }
    setLoading(false);
  };

  const columns = [
    {
      title: 'Face',
      key: 'photo',
      width: 90,
      render: (_, r) => <FacePhoto logId={r._id} fallbackUrl={r.capturedImageUrl} />,
    },
    {
      title: 'Seen At',
      dataIndex: 'timestamp',
      render: (ts) => <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{formatTimestamp(ts)}</span>,
    },
    {
      title: 'Bus',
      key: 'bus',
      render: (_, r) => r.busId?.busNumber
        ? <Tag color="blue" style={{ fontWeight: 600, borderRadius: 20 }}>{r.busId.busNumber}</Tag>
        : <span style={{ color: 'var(--color-text-muted)' }}>N/A</span>,
    },
    {
      title: 'Result',
      dataIndex: 'recognitionStatus',
      render: (v) => (
        <span className={`status-badge ${v === 'low_confidence' ? 'unpaid' : 'active'}`}>
          {String(v || 'unknown').replace(/_/g, ' ')}
        </span>
      ),
      filters: [
        { text: 'Low confidence', value: 'low_confidence' },
        { text: 'Unidentified', value: 'unidentified' },
      ],
      onFilter: (value, record) => record.recognitionStatus === value,
    },
    {
      title: 'Confidence',
      dataIndex: 'confidenceScore',
      render: (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '—'),
      sorter: (a, b) => (a.confidenceScore || 0) - (b.confidenceScore || 0),
    },
    {
      title: 'Why',
      dataIndex: 'errorMessage',
      render: (v) => (
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{v || 'Person not found'}</span>
      ),
    },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Unknown Faces</h1>
          <p className="page-subtitle">
            {total > 0
              ? `${total} unrecognised encounter${total === 1 ? '' : 's'}${today ? ` · ${today} today` : ''}`
              : 'Everyone the face scanner could not identify'}
          </p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchUnknown}
          loading={loading}
          style={{ borderRadius: 10, fontWeight: 600 }}
        >
          Refresh
        </Button>
      </div>

      {/* Alert Banner */}
      {today > 0 && (
        <div className="alert-banner danger animate-fade-in-up delay-1">
          <QuestionCircleOutlined style={{ fontSize: 18, flexShrink: 0 }} />
          <span>
            <strong>{today}</strong> unknown {today === 1 ? 'person was' : 'people were'} seen today.
          </span>
          <span className="alert-count-badge">{today}</span>
        </div>
      )}
      {total === 0 && !loading && (
        <div className="alert-banner success animate-fade-in-up delay-1">
          <ReloadOutlined style={{ fontSize: 18, flexShrink: 0 }} />
          <span>No unknown faces recorded - every scan matched a registered student.</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="filter-bar animate-fade-in-up delay-1">
        <QuestionCircleOutlined style={{ color: 'var(--color-text-muted)', fontSize: 16 }} />
        <RangePicker
          style={{ borderRadius: 10 }}
          onChange={(_, [start, end]) => setFilters((f) => ({ ...f, startDate: start, endDate: end, page: 1 }))}
          placeholder={['Start Date', 'End Date']}
        />
        <Select
          placeholder="Result"
          style={{ width: 180 }}
          allowClear
          onChange={(v) => setFilters((f) => ({ ...f, status: v, page: 1 }))}
        >
          <Select.Option value="low_confidence">Low confidence</Select.Option>
          <Select.Option value="unidentified">Unidentified</Select.Option>
        </Select>
        <Button icon={<ReloadOutlined />} onClick={fetchUnknown} loading={loading} style={{ borderRadius: 10 }}>
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="premium-card animate-fade-in-up delay-2" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '14px 20px', borderBottom: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <QuestionCircleOutlined style={{ color: 'var(--color-warning)' }} />
            All Unknown Encounters
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#991b1b', background: 'var(--color-danger-bg)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
              {total} total
            </span>
            {today > 0 && (
              <span style={{ fontSize: 12, color: '#92400e', background: 'var(--color-warning-bg)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
                {today} today
              </span>
            )}
          </div>
        </div>

        <Table
          dataSource={rows}
          columns={columns}
          loading={loading}
          rowKey="_id"
          pagination={{
            total,
            current: filters.page,
            pageSize: filters.limit,
            onChange: (page) => setFilters((f) => ({ ...f, page })),
            showSizeChanger: false,
            showTotal: (t, range) => (
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                {range[0]}–{range[1]} of {t} records
              </span>
            ),
          }}
          locale={{
            emptyText: (
              <div className="empty-state">
                <div className="empty-state-icon">🙂</div>
                <div className="empty-state-text">No unknown faces found</div>
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
};

export default UnknownFaces;
