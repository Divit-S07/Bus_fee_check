import React, { useEffect, useState } from 'react';
import { Table, Tag, Avatar, Tooltip } from 'antd';
import {
  TeamOutlined,
  CarOutlined,
  RiseOutlined,
  WarningOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useWebSocket } from '../hooks/useWebSocket';
import { travelStore } from '../stores/travelStore';
import api from '../api/client';

const KpiCard = ({ icon, iconBg, value, label, trend, trendLabel, delay, isPulsing }) => (
  <div className={`kpi-card card-hover animate-fade-in-up delay-${delay}`}>
    <div className="kpi-icon" style={{ background: iconBg }} aria-hidden="true">
      {icon}
    </div>
    <div className="kpi-value" style={isPulsing ? { color: '#ef4444' } : undefined}>
      {value ?? '—'}
    </div>
    <div className="kpi-label">{label}</div>
    {trendLabel && (
      <div className="kpi-trend" style={{ color: 'var(--color-text-muted)' }}>
        {trendLabel}
      </div>
    )}
    {isPulsing && (
      <span
        aria-label="Requires attention"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: '#ef4444',
          display: 'inline-block',
          animation: 'pulse-ring 2s ease infinite',
        }}
      />
    )}
  </div>
);

const StatusBadge = ({ status }) => {
  const s = (status || 'paid').toLowerCase();
  return <span className={`status-badge ${s}`}>{s.toUpperCase()}</span>;
};

const formatTimestamp = (ts) => {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return ts; }
};

const Dashboard = () => {
  useWebSocket();
  const { recentTravels, unpaidCount } = travelStore();
  const [stats, setStats] = useState({ totalStudents: 0, totalBuses: 0, todayTravels: 0, unpaidToday: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/analytics/dashboard');
        setStats(res.data);
      } catch (e) {
        console.error('Failed to fetch dashboard stats:', e);
      }
    };
    fetchStats();
  }, []);

  const complianceRate = stats.todayTravels > 0
    ? Math.round(((stats.todayTravels - stats.unpaidToday) / stats.todayTravels) * 100)
    : 100;

  const columns = [
    {
      title: 'Student',
      key: 'student',
      render: (_, r) => {
        const name = r.studentId
          ? `${r.studentId.firstName || ''} ${r.studentId.lastName || ''}`.trim() || r.studentId.studentId
          : 'N/A';
        const sid = r.studentId?.studentId || '';
        const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
        return (
          <div className="student-name-cell">
            <Avatar
              src={r.studentId?.photoUrl || r.studentId?.faceData?.referenceImageUrl}
              size={32}
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}
            >
              {initials}
            </Avatar>
            <div>
              <div className="name-text">{name}</div>
              {sid && <div className="id-text">{sid}</div>}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Bus',
      key: 'bus',
      render: (_, r) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CarOutlined style={{ color: 'var(--color-text-muted)', fontSize: 13 }} />
          <span style={{ fontWeight: 500 }}>{r.busId?.busNumber || 'N/A'}</span>
        </span>
      ),
    },
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'time',
      render: (ts) => (
        <span className="nowrap" style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
          <ClockCircleOutlined style={{ marginRight: 5, opacity: 0.5 }} />
          {formatTimestamp(ts)}
        </span>
      ),
    },
    {
      title: 'Fee Status',
      dataIndex: 'feeStatusAtTime',
      key: 'status',
      render: (status) => <StatusBadge status={status} />,
    },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dashboard</h1>
          <p className="page-subtitle">Real-time bus fleet & fee compliance overview</p>
        </div>
        <div className="live-indicator" aria-label="Live data connection active">
          <span className="live-dot" />
          LIVE
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard
          delay={1}
          icon={<TeamOutlined style={{ color: '#6366f1', fontSize: 22 }} />}
          iconBg="linear-gradient(135deg, #eef2ff, #e0e7ff)"
          value={stats.totalStudents}
          label="Total Students"
          trendLabel="All registered students"
        />
        <KpiCard
          delay={2}
          icon={<CarOutlined style={{ color: '#8b5cf6', fontSize: 22 }} />}
          iconBg="linear-gradient(135deg, #f5f3ff, #ede9fe)"
          value={stats.totalBuses}
          label="Active Buses"
          trendLabel="Fleet on routes"
        />
        <KpiCard
          delay={3}
          icon={<RiseOutlined style={{ color: '#10b981', fontSize: 22 }} />}
          iconBg="linear-gradient(135deg, #d1fae5, #a7f3d0)"
          value={stats.todayTravels}
          label="Today's Travels"
          trendLabel={`${complianceRate}% compliance rate`}
        />
        <KpiCard
          delay={4}
          icon={<WarningOutlined style={{ color: '#ef4444', fontSize: 22 }} />}
          iconBg="linear-gradient(135deg, #fee2e2, #fecaca)"
          value={stats.unpaidToday}
          label="Unpaid Today"
          trendLabel="Require resolution"
          isPulsing={stats.unpaidToday > 0}
        />
      </div>

      {/* Recent Travels Table */}
      <div
        className="premium-card animate-fade-in-up delay-4"
        style={{ padding: 0, overflow: 'hidden' }}
      >
        <div
          className="section-header"
          style={{ padding: '18px 24px', borderBottom: '1px solid var(--color-border)', margin: 0 }}
        >
          <div className="section-title">
            <ClockCircleOutlined style={{ color: 'var(--color-primary)' }} />
            Recent Travels
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Updates in real-time via WebSocket
          </span>
        </div>
        <Table
          dataSource={recentTravels}
          columns={columns}
          rowKey="_id"
          pagination={false}
          locale={{
            emptyText: (
              <div className="empty-state">
                <div className="empty-state-icon">🚌</div>
                <div className="empty-state-text">No recent travel records</div>
              </div>
            ),
          }}
          style={{ borderRadius: 0 }}
        />
      </div>
    </div>
  );
};

export default Dashboard;