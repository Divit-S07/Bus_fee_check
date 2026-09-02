import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Input, message, Tag } from 'antd';
import { CheckCircleOutlined, ReloadOutlined, WarningOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import api from '../api/client';

const formatTimestamp = (ts) => {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return ts; }
};

const RepeatBadge = ({ count }) => {
  if (!count || count <= 0) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  const color = count >= 3 ? '#ef4444' : count >= 2 ? '#f59e0b' : '#3b82f6';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 26, height: 26,
      background: color,
      color: '#fff',
      borderRadius: '50%',
      fontSize: 12,
      fontWeight: 700,
    }}>
      {count}
    </span>
  );
};

const UnpaidTravels = () => {
  const [unpaid, setUnpaid] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolveModal, setResolveModal] = useState({ visible: false, id: null, studentName: '' });
  const [resolutionNotes, setResolutionNotes] = useState('');

  useEffect(() => { fetchUnpaid(); }, []);

  const fetchUnpaid = async () => {
    setLoading(true);
    try {
      const res = await api.get('/unpaid');
      setUnpaid(res.data);
    } catch (e) {
      message.error('Failed to fetch unpaid travels');
    }
    setLoading(false);
  };

  const resolveUnpaid = async (id, notes) => {
    try {
      await api.put(`/unpaid/${id}/resolve`, { notes });
      message.success('Travel resolved successfully');
      setResolveModal({ visible: false, id: null, studentName: '' });
      setResolutionNotes('');
      fetchUnpaid();
    } catch (err) {
      message.error('Resolution failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const unresolvedList = unpaid.filter(r => !r.resolved);
  const resolvedList   = unpaid.filter(r => r.resolved);

  const columns = [
    {
      title: 'Student',
      key: 'student',
      render: (_, r) => {
        const name = r.studentId
          ? `${r.studentId.firstName || ''} ${r.studentId.lastName || ''}`.trim() || r.studentId.studentId
          : 'N/A';
        const sid = r.studentId?.studentId;
        return (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
            {sid && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{sid}</div>}
          </div>
        );
      },
    },
    {
      title: 'Bus',
      key: 'bus',
      render: (_, r) => r.busId?.busNumber
        ? <Tag color="blue" style={{ fontWeight: 600, borderRadius: 20 }}>{r.busId.busNumber}</Tag>
        : <span style={{ color: 'var(--color-text-muted)' }}>N/A</span>,
    },
    {
      title: 'Time',
      dataIndex: 'timestamp',
      render: (ts) => <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{formatTimestamp(ts)}</span>,
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      render: (v) => <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{v || '—'}</span>,
    },
    {
      title: 'Repeats',
      dataIndex: 'repeatCount',
      render: (v) => <RepeatBadge count={v} />,
      sorter: (a, b) => (a.repeatCount || 0) - (b.repeatCount || 0),
    },
    {
      title: 'Status',
      dataIndex: 'resolved',
      render: (v) => v
        ? <span className="status-badge active">Resolved</span>
        : <span className="status-badge unpaid">Unresolved</span>,
      filters: [
        { text: 'Unresolved', value: false },
        { text: 'Resolved', value: true },
      ],
      onFilter: (value, record) => record.resolved === value,
    },
    {
      title: '',
      key: 'actions',
      render: (_, r) => !r.resolved ? (
        <Button
          type="primary"
          size="small"
          icon={<CheckCircleOutlined />}
          style={{ borderRadius: 8, fontWeight: 600, background: 'var(--color-success)', borderColor: 'var(--color-success)' }}
          onClick={() => {
            const name = r.studentId
              ? `${r.studentId.firstName || ''} ${r.studentId.lastName || ''}`.trim() || r.studentId.studentId
              : 'this student';
            setResolveModal({ visible: true, id: r._id, studentName: name });
          }}
        >
          Resolve
        </Button>
      ) : null,
    },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Unpaid Travels</h1>
          <p className="page-subtitle">Flagged boarding records requiring resolution</p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchUnpaid}
          loading={loading}
          style={{ borderRadius: 10, fontWeight: 600 }}
        >
          Refresh
        </Button>
      </div>

      {/* Alert Banner */}
      {unresolvedList.length > 0 && (
        <div className="alert-banner danger animate-fade-in-up delay-1">
          <WarningOutlined style={{ fontSize: 18, flexShrink: 0 }} />
          <span>
            <strong>{unresolvedList.length} unresolved</strong> travel records require your attention.
          </span>
          <span className="alert-count-badge">{unresolvedList.length}</span>
        </div>
      )}

      {unresolvedList.length === 0 && !loading && (
        <div className="alert-banner success animate-fade-in-up delay-1">
          <CheckCircleOutlined style={{ fontSize: 18, flexShrink: 0 }} />
          <span>All travel records are resolved. Great job! 🎉</span>
        </div>
      )}

      {/* Table */}
      <div className="premium-card animate-fade-in-up delay-2" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExclamationCircleOutlined style={{ color: 'var(--color-danger)' }} />
            All Flagged Records
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {unresolvedList.length > 0 && (
              <span style={{ fontSize: 12, color: '#991b1b', background: 'var(--color-danger-bg)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
                {unresolvedList.length} unresolved
              </span>
            )}
            {resolvedList.length > 0 && (
              <span style={{ fontSize: 12, color: '#065f46', background: 'var(--color-success-bg)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
                {resolvedList.length} resolved
              </span>
            )}
          </div>
        </div>
        <Table
          dataSource={unpaid}
          columns={columns}
          loading={loading}
          rowKey="_id"
          rowClassName={(r) => r.resolved ? '' : 'ant-table-row-unpaid'}
          locale={{ emptyText: <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-text">No flagged records found</div></div> }}
        />
      </div>

      {/* Resolve Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircleOutlined style={{ color: '#92400e', fontSize: 16 }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Resolve Unpaid Travel</div>
              {resolveModal.studentName && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400 }}>
                  Student: {resolveModal.studentName}
                </div>
              )}
            </div>
          </div>
        }
        open={resolveModal.visible}
        onCancel={() => setResolveModal({ visible: false, id: null, studentName: '' })}
        footer={null}
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            Please add resolution notes explaining how this was handled (payment collected, exempted, etc.)
          </div>
          <Input.TextArea
            placeholder="e.g. Fee collected in cash at gate, receipt #12345…"
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            rows={4}
            style={{ marginBottom: 16, borderRadius: 10 }}
            id="resolve-notes-input"
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button onClick={() => setResolveModal({ visible: false, id: null, studentName: '' })}>
              Cancel
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => resolveUnpaid(resolveModal.id, resolutionNotes)}
              style={{ fontWeight: 600, background: 'var(--color-success)', borderColor: 'var(--color-success)' }}
            >
              Confirm Resolution
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UnpaidTravels;