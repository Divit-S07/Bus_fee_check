import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Input,
  Select,
  Tag,
  Card,
  Row,
  Col,
  Statistic,
  Badge,
  Tooltip,
  DatePicker,
  Segmented,
  Timeline,
  Avatar,
  message,
  Empty,
  Spin,
  Alert,
} from 'antd';
import {
  CarOutlined,
  UserOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
  DownloadOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  HistoryOutlined,
  AppstoreOutlined,
  BarsOutlined,
  PhoneOutlined,
  MailOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { io } from 'socket.io-client';
import api from '../api/client';

const { RangePicker } = DatePicker;

const formatTimestamp = (ts) => {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return ts;
  }
};

const TripCountBadge = ({ count, isRepeat }) => {
  if (!count || count <= 0) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  const bgColor = count >= 3 ? '#ef4444' : count === 2 ? '#f59e0b' : '#3b82f6';
  return (
    <Space orientation="horizontal" size={6} align="center">
      <span
         orientation="horizontal"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          background: bgColor,
          color: '#fff',
          borderRadius: '50%',
          fontSize: 12,
          fontWeight: 700,
          boxShadow: count >= 3 ? '0 0 8px rgba(239, 68, 68, 0.45)' : undefined,
        }}
      >
        {count}
      </span>
      {isRepeat && (
        <Tag color="error" style={{ borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
          Repeat Offender
        </Tag>
      )}
    </Space>
  );
};

const BusUnpaidTracking = () => {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedBus, setSelectedBus] = useState('all');
  const [statusFilter, setStatusFilter] = useState('unresolved');
  const [repeatOnly, setRepeatOnly] = useState('all');
  const [dateRange, setDateRange] = useState(null);
  const [viewMode, setViewMode] = useState('bus_grouped'); // 'bus_grouped' or 'table'

  // Modals
  const [historyModal, setHistoryModal] = useState({ visible: false, record: null });
  const [resolveModal, setResolveModal] = useState({ visible: false, record: null, notes: '' });
  const [resolving, setResolving] = useState(false);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/bus-unpaid/summary');
      if (res.data?.success) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.error('Failed to fetch summary:', err);
    }
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (selectedBus !== 'all') params.busNumber = selectedBus;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (repeatOnly === 'repeat') params.isRepeatOffender = true;
      if (search.trim()) params.search = search.trim();
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const res = await api.get('/bus-unpaid', { params });
      if (res.data?.success) {
        setData(res.data.data || []);
      }
    } catch (err) {
      message.error('Failed to fetch bus-wise unpaid records: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, [selectedBus, statusFilter, repeatOnly, search, dateRange]);

  // Initial load
  useEffect(() => {
    fetchSummary();
    fetchData();
  }, [fetchSummary, fetchData]);

  // Real-time WebSocket updates
  useEffect(() => {
    const socket = io(import.meta.env.VITE_WS_URL, {
      transports: ['polling', 'websocket'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      socket.emit('join-dashboard');
    });

    socket.on('bus-unpaid-updated', (eventData) => {
      message.warning({
        content: `Unpaid travel detected on Bus ${eventData.busNumber}: ${eventData.studentName} (Trip #${eventData.unpaidTripCount})`,
        duration: 4,
        key: `unpaid-${eventData.studentId}-${Date.now()}`,
      });
      // Refresh summary & table data smoothly
      fetchSummary();
      fetchData();
    });

    socket.on('bus-unpaid-resolved', () => {
      fetchSummary();
      fetchData();
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchSummary, fetchData]);

  // Backfill sync
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.get('/bus-unpaid/sync');
      if (res.data?.success) {
        message.success(
          `Sync complete: ${res.data.result.syncedCount} trips synchronized. Total tracked records: ${res.data.result.totalRecords}`
        );
        fetchSummary();
        fetchData();
      }
    } catch (err) {
      message.error('Sync failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setSyncing(false);
    }
  };

  // Submit resolution
  const handleResolveSubmit = async () => {
    if (!resolveModal.record) return;
    setResolving(true);
    try {
      await api.put(`/bus-unpaid/${resolveModal.record._id}/resolve`, {
        notes: resolveModal.notes || 'Resolved via Bus-wise Dashboard',
      });
      message.success(`Unpaid records for ${resolveModal.record.studentDetails?.fullName || 'student'} marked resolved.`);
      setResolveModal({ visible: false, record: null, notes: '' });
      fetchSummary();
      fetchData();
    } catch (err) {
      message.error('Resolution failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setResolving(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (data.length === 0) {
      message.info('No records to export');
      return;
    }
    const headers = [
      'Bus Number',
      'Route Name',
      'Student ID',
      'Student Name',
      'Department',
      'Batch',
      'Phone Number',
      'Email',
      'Bus Unpaid Trips',
      'Total Unpaid Trips (All Buses)',
      'Repeat Offender',
      'Status',
      'First Travel Date',
      'Last Travel Date',
    ];

    const rows = data.map((item) => [
      `"${item.busNumber || ''}"`,
      `"${item.routeName || ''}"`,
      `"${item.studentDetails?.studentId || ''}"`,
      `"${item.studentDetails?.fullName || ''}"`,
      `"${item.studentDetails?.department || ''}"`,
      `"${item.studentDetails?.batch || ''}"`,
      `"${item.studentDetails?.phonenumber || ''}"`,
      `"${item.studentDetails?.email || ''}"`,
      item.unpaidTripCount || 1,
      item.totalUnpaidTripsAcrossBuses || 1,
      item.isRepeatOffender ? 'YES' : 'NO',
      item.status || (item.resolved ? 'resolved' : 'unresolved'),
      item.firstTravelDate ? new Date(item.firstTravelDate).toISOString() : '',
      item.lastTravelDate ? new Date(item.lastTravelDate).toISOString() : '',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bus_unpaid_students_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('CSV downloaded successfully');
  };

  // Group records by bus for the grouped view
  const groupedByBus = useMemo(() => {
    const groups = {};
    data.forEach((item) => {
      const busKey = item.busNumber || 'Unknown Bus';
      if (!groups[busKey]) {
        groups[busKey] = {
          busNumber: busKey,
          routeName: item.routeName || '',
          busId: item.busId?._id || item.busId,
          busDetails: item.busId,
          records: [],
          totalTrips: 0,
          repeatCount: 0,
          unresolvedCount: 0,
        };
      }
      groups[busKey].records.push(item);
      groups[busKey].totalTrips += item.unpaidTripCount || 1;
      if (item.isRepeatOffender) groups[busKey].repeatCount += 1;
      if (!item.resolved) groups[busKey].unresolvedCount += 1;
    });

    // Return as array sorted by total unpaid trips descending
    return Object.values(groups).sort((a, b) => b.totalTrips - a.totalTrips);
  }, [data]);

  // Unique bus options for dropdown
  const busOptions = useMemo(() => {
    const set = new Set();
    if (summary?.busStats) {
      summary.busStats.forEach((b) => set.add(b.busNumber));
    }
    data.forEach((d) => {
      if (d.busNumber) set.add(d.busNumber);
    });
    return Array.from(set).sort();
  }, [summary, data]);

  // Columns definition for flat and grouped student tables
  const getColumns = (showBusCol = true) => [
    {
      title: 'Student',
      key: 'student',
      render: (_, r) => {
        const details = r.studentDetails || {};
        return (
          <Space orientation="horizontal" size={12}>
            <Avatar
              size={42}
              src={details.photoUrl || undefined}
              icon={!details.photoUrl && <UserOutlined />}
              style={{
                backgroundColor: r.isRepeatOffender ? '#fee2e2' : '#e0e7ff',
                color: r.isRepeatOffender ? '#ef4444' : '#4f46e5',
                fontWeight: 600,
                border: r.isRepeatOffender ? '2px solid #ef4444' : '1px solid #c7d2fe',
              }}
            >
              {details.firstName ? details.firstName.charAt(0) : 'S'}
            </Avatar>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>
                {details.fullName || details.studentId}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#4f46e5' }}>
                  {details.studentId}
                </span>
                {details.department && ` · ${details.department}`}
                {details.batch && ` (${details.batch})`}
              </div>
            </div>
          </Space>
        );
      },
    },
    ...(showBusCol
      ? [
          {
            title: 'Bus / Route',
            key: 'bus',
            render: (_, r) => (
              <div>
                <Tag color="geekblue" style={{ fontWeight: 600, borderRadius: 12, padding: '2px 8px' }}>
                  <CarOutlined style={{ marginRight: 4 }} />
                  {r.busNumber}
                </Tag>
                {r.routeName && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    {r.routeName}
                  </div>
                )}
              </div>
            ),
          },
        ]
      : []),
    {
      title: 'Bus Unpaid Trips',
      key: 'tripCount',
      sorter: (a, b) => a.unpaidTripCount - b.unpaidTripCount,
      render: (_, r) => (
        <TripCountBadge count={r.unpaidTripCount} isRepeat={r.isRepeatOffender || r.unpaidTripCount >= 3} />
      ),
    },
    {
      title: 'Total Across Buses',
      key: 'totalTrips',
      render: (_, r) => {
        const total = r.totalUnpaidTripsAcrossBuses || r.unpaidTripCount;
        return (
          <Tooltip title={`Total unresolved trips across all college buses: ${total}`}>
            <Tag color={total > r.unpaidTripCount ? 'volcano' : 'default'} style={{ borderRadius: 10 }}>
              {total} {total === 1 ? 'trip' : 'trips'}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Last Travel Date',
      dataIndex: 'lastTravelDate',
      key: 'lastTravelDate',
      sorter: (a, b) => new Date(a.lastTravelDate) - new Date(b.lastTravelDate),
      render: (ts) => (
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          <ClockCircleOutlined style={{ marginRight: 6, color: '#94a3b8' }} />
          {formatTimestamp(ts)}
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, r) => (
        r.resolved ? (
          <Tag color="success" icon={<CheckCircleOutlined />} style={{ borderRadius: 12, fontWeight: 600 }}>
            Resolved
          </Tag>
        ) : (
          <Tag color="error" icon={<WarningOutlined />} style={{ borderRadius: 12, fontWeight: 600 }}>
            Unresolved
          </Tag>
        )
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, r) => (
        <Space orientation="horizontal" size={8}>
          <Tooltip title="View Student Bus Trip History">
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => setHistoryModal({ visible: true, record: r })}
            >
              History
            </Button>
          </Tooltip>
          {!r.resolved && (
            <Button
              size="small"
              type="primary"
              style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
              icon={<CheckCircleOutlined />}
              onClick={() => setResolveModal({ visible: true, record: r, notes: '' })}
            >
              Resolve
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '4px 0 32px 0' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Bus-wise Unpaid Student Tracking
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-secondary)', fontSize: 14 }}>
            Real-time tracking of unpaid student boardings grouped by college bus. Automatically updated when face recognition detects an unpaid student.
          </p>
        </div>

        <Space orientation="horizontal" wrap size={10}>
          <Button
            icon={<SyncOutlined spin={syncing} />}
            loading={syncing}
            onClick={handleSync}
            title="Scan and synchronize all past unpaid records into bus tracking"
          >
            Sync Historical Data
          </Button>

          <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>
            Export CSV
          </Button>

          <Button
            type="primary"
            icon={<ReloadOutlined spin={loading} />}
            loading={loading}
            onClick={() => {
              fetchSummary();
              fetchData();
            }}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {/* KPI Cards Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Statistic
              title={
                <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  <UserOutlined style={{ marginRight: 6, color: '#6366f1' }} />
                  Total Unpaid Students
                </span>
              }
              value={summary?.totalUnpaidStudents ?? '—'}
              valueStyle={{ fontWeight: 700, color: '#0f172a' }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
              Unique students identified without fee payment
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Statistic
              title={
                <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  <WarningOutlined style={{ marginRight: 6, color: '#f59e0b' }} />
                  Total Unpaid Trips
                </span>
              }
              value={summary?.totalUnpaidTrips ?? '—'}
              valueStyle={{ fontWeight: 700, color: '#f59e0b' }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
              Total unverified boarding instances logged
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              backgroundColor: summary?.totalRepeatOffenders > 0 ? '#fff5f5' : '#ffffff',
            }}
          >
            <Statistic
              title={
                <span style={{ color: summary?.totalRepeatOffenders > 0 ? '#ef4444' : 'var(--color-text-secondary)', fontWeight: 600 }}>
                  <ExclamationCircleOutlined style={{ marginRight: 6, color: '#ef4444' }} />
                  Repeat Offenders (≥ 3 Trips)
                </span>
              }
              value={summary?.totalRepeatOffenders ?? '—'}
              valueStyle={{ fontWeight: 700, color: '#ef4444' }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: summary?.totalRepeatOffenders > 0 ? '#b91c1c' : 'var(--color-text-muted)' }}>
              Students requiring immediate administrative action
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              <CarOutlined style={{ marginRight: 6, color: '#10b981' }} />
              Most Affected Bus
            </div>
            {summary?.mostAffectedBus ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
                    {summary.mostAffectedBus.busNumber}
                  </span>
                  <Tag color="red" style={{ borderRadius: 10 }}>
                    {summary.mostAffectedBus.totalUnpaidTrips} trips
                  </Tag>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  {summary.mostAffectedBus.routeName || 'Standard Route'} · {summary.mostAffectedBus.studentCount} students
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No data yet</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Filter and Control Bar */}
      <Card
        bordered={false}
        style={{
          borderRadius: 12,
          marginBottom: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
        bodyStyle={{ padding: 16 }}
      >
        <Row gutter={[12, 12]} align="middle" justify="space-between">
          <Col xs={24} md={18}>
            <Space orientation="horizontal" wrap size={10} style={{ width: '100%' }}>
              {/* Search */}
              <Input
                placeholder="Search student, roll no, bus..."
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 220, borderRadius: 8 }}
                allowClear
              />

              {/* Bus selector */}
              <Select
                value={selectedBus}
                onChange={setSelectedBus}
                style={{ width: 160 }}
                options={[
                  { label: 'All Buses', value: 'all' },
                  ...busOptions.map((b) => ({ label: `Bus ${b}`, value: b })),
                ]}
              />

              {/* Status filter */}
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 140 }}
                options={[
                  { label: 'Unresolved', value: 'unresolved' },
                  { label: 'Resolved', value: 'resolved' },
                  { label: 'All Status', value: 'all' },
                ]}
              />

              {/* Repeat filter */}
              <Select
                value={repeatOnly}
                onChange={setRepeatOnly}
                style={{ width: 160 }}
                options={[
                  { label: 'All Students', value: 'all' },
                  { label: 'Only Repeat (≥3)', value: 'repeat' },
                ]}
              />

              {/* Date Range */}
              <RangePicker
                value={dateRange}
                onChange={setDateRange}
                style={{ borderRadius: 8, maxWidth: 240 }}
                format="DD/MM/YYYY"
              />
            </Space>
          </Col>

          {/* View mode toggle */}
          <Col xs={24} md={6} style={{ textAlign: 'right' }}>
            <Segmented
              value={viewMode}
              onChange={setViewMode}
              options={[
                { label: 'Bus Cards', value: 'bus_grouped', icon: <AppstoreOutlined /> },
                { label: 'Full Table', value: 'table', icon: <BarsOutlined /> },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* Main Content Area */}
      {loading && data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" tip="Loading bus unpaid records..." />
        </div>
      ) : data.length === 0 ? (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: '40px 0' }}>
          <Empty
            description={
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  No Unpaid Student Records Found
                </div>
                <div style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  {statusFilter === 'unresolved'
                    ? 'All students on selected buses are currently cleared, or no unpaid trips have been logged.'
                    : 'No records matching the selected search criteria.'}
                </div>
              </div>
            }
          >
            <Button icon={<SyncOutlined />} onClick={handleSync}>
              Check and Sync Past Records
            </Button>
          </Empty>
        </Card>
      ) : viewMode === 'table' ? (
        /* Full Flat Table View */
        <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Table
            columns={getColumns(true)}
            dataSource={data}
            rowKey="_id"
            loading={loading}
            pagination={{
              pageSize: 15,
              showSizeChanger: true,
              pageSizeOptions: ['15', '30', '50', '100'],
              showTotal: (total) => `Total ${total} student records`,
            }}
          />
        </Card>
      ) : (
        /* Bus-Grouped Cards View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groupedByBus.map((busGroup) => (
            <Card
              key={busGroup.busNumber}
              bordered={false}
              style={{
                borderRadius: 14,
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                borderLeft: busGroup.repeatCount > 0 ? '4px solid #ef4444' : '4px solid #6366f1',
              }}
              bodyStyle={{ padding: '20px 24px' }}
            >
              {/* Bus Card Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <Space orientation="horizontal" size={14} align="center">
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: '#eef2ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#4f46e5',
                      fontSize: 22,
                    }}
                  >
                    <CarOutlined />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        Bus {busGroup.busNumber}
                      </span>
                      {busGroup.routeName && (
                        <Tag color="blue" style={{ borderRadius: 10 }}>
                          Route: {busGroup.routeName}
                        </Tag>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      {busGroup.records.length} {busGroup.records.length === 1 ? 'student' : 'students'} tracked on this bus
                    </div>
                  </div>
                </Space>

                <Space orientation="horizontal" size={10} wrap>
                  <Tag color="warning" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 12 }}>
                    <strong>{busGroup.totalTrips}</strong> Total Unpaid Trips
                  </Tag>
                  {busGroup.repeatCount > 0 && (
                    <Tag color="error" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 12 }}>
                      <strong>{busGroup.repeatCount}</strong> Repeat {busGroup.repeatCount === 1 ? 'Offender' : 'Offenders'}
                    </Tag>
                  )}
                  {busGroup.unresolvedCount > 0 ? (
                    <Badge count={`${busGroup.unresolvedCount} Unresolved`} style={{ backgroundColor: '#ef4444' }} />
                  ) : (
                    <Badge count="All Resolved" style={{ backgroundColor: '#10b981' }} />
                  )}
                </Space>
              </div>

              {/* Students on this Bus */}
              <Table
                columns={getColumns(false)}
                dataSource={busGroup.records}
                rowKey="_id"
                pagination={busGroup.records.length > 5 ? { pageSize: 5, size: 'small' } : false}
                size="middle"
              />
            </Card>
          ))}
        </div>
      )}

      {/* Student Bus Trip History Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HistoryOutlined style={{ color: '#4f46e5' }} />
            <span>Unpaid Trip History on Bus {historyModal.record?.busNumber}</span>
          </div>
        }
        open={historyModal.visible}
        onCancel={() => setHistoryModal({ visible: false, record: null })}
        footer={[
          <Button key="close" onClick={() => setHistoryModal({ visible: false, record: null })}>
            Close
          </Button>,
          historyModal.record && !historyModal.record.resolved && (
            <Button
              key="resolve"
              type="primary"
              style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
              onClick={() => {
                const rec = historyModal.record;
                setHistoryModal({ visible: false, record: null });
                setResolveModal({ visible: true, record: rec, notes: '' });
              }}
            >
              Resolve Student
            </Button>
          ),
        ]}
        width={680}
      >
        {historyModal.record && (
          <div>
            {/* Student Overview Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 16,
                backgroundColor: '#f8fafc',
                borderRadius: 12,
                marginBottom: 20,
              }}
            >
              <Avatar
                size={54}
                src={historyModal.record.studentDetails?.photoUrl || undefined}
                icon={<UserOutlined />}
                style={{
                  backgroundColor: historyModal.record.isRepeatOffender ? '#fee2e2' : '#e0e7ff',
                  color: historyModal.record.isRepeatOffender ? '#ef4444' : '#4f46e5',
                  fontSize: 22,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {historyModal.record.studentDetails?.fullName || historyModal.record.studentDetails?.studentId}
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  <IdcardOutlined style={{ marginRight: 4 }} />
                  ID: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{historyModal.record.studentDetails?.studentId}</span>
                  {historyModal.record.studentDetails?.department && ` · ${historyModal.record.studentDetails?.department}`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {historyModal.record.studentDetails?.phonenumber && (
                    <span style={{ marginRight: 12 }}>
                      <PhoneOutlined style={{ marginRight: 4 }} />
                      {historyModal.record.studentDetails?.phonenumber}
                    </span>
                  )}
                  {historyModal.record.studentDetails?.email && (
                    <span>
                      <MailOutlined style={{ marginRight: 4 }} />
                      {historyModal.record.studentDetails?.email}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Bus Trips Logged</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
                  {historyModal.record.unpaidTripCount}
                </div>
              </div>
            </div>

            {/* Timeline of Trips */}
            <div style={{ maxHeight: 340, overflowY: 'auto', padding: '0 8px' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, color: 'var(--color-text-primary)' }}>
                Boarding Events Logged by Face Recognition:
              </div>
              {historyModal.record.tripHistory && historyModal.record.tripHistory.length > 0 ? (
                <Timeline
                  items={historyModal.record.tripHistory.map((trip, idx) => ({
                    color: idx === 0 ? 'red' : 'blue',
                    children: (
                      <div key={idx} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {formatTimestamp(trip.timestamp)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                          Reason: <strong>{trip.reason || 'no_payment'}</strong>
                          {trip.confidenceScore && (
                            <span style={{ marginLeft: 8 }}>
                              · AI Match Confidence: {(trip.confidenceScore * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                    ),
                  }))}
                />
              ) : (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  Single initial travel recorded on {formatTimestamp(historyModal.record.firstTravelDate)}.
                </div>
              )}
            </div>

            {historyModal.record.resolved && (
              <Alert
                type="success"
                showIcon
                style={{ marginTop: 16, borderRadius: 8 }}
                message="Record Resolved"
                description={`Resolved on ${formatTimestamp(historyModal.record.resolvedAt)}. Notes: ${historyModal.record.resolutionNotes || 'None'}`}
              />
            )}
          </div>
        )}
      </Modal>

      {/* Resolution Confirmation Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircleOutlined style={{ color: '#10b981' }} />
            <span>Resolve Bus Unpaid Record</span>
          </div>
        }
        open={resolveModal.visible}
        onCancel={() => setResolveModal({ visible: false, record: null, notes: '' })}
        onOk={handleResolveSubmit}
        confirmLoading={resolving}
        okText="Confirm & Mark Resolved"
        okButtonProps={{ style: { backgroundColor: '#10b981', borderColor: '#10b981' } }}
      >
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          You are marking all unpaid boardings on{' '}
          <strong>Bus {resolveModal.record?.busNumber}</strong> for student{' '}
          <strong>{resolveModal.record?.studentDetails?.fullName || resolveModal.record?.studentDetails?.studentId}</strong>{' '}
          as resolved.
        </p>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Resolution Notes / Fee Payment Reference:
          </label>
          <Input.TextArea
            rows={3}
            placeholder="e.g., Student paid via counter receipt #10492 / cash receipt verified"
            value={resolveModal.notes}
            onChange={(e) => setResolveModal((prev) => ({ ...prev, notes: e.target.value }))}
            style={{ borderRadius: 8 }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default BusUnpaidTracking;

