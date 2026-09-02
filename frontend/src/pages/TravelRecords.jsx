import React, { useState, useEffect } from 'react';
import { Table, Card, DatePicker, Select, Button, Space, Tag, Tooltip } from 'antd';
import { ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import api from '../api/client';

const { RangePicker } = DatePicker;

const StatusBadge = ({ status }) => {
  const s = (status || 'paid').toLowerCase();
  return <span className={`status-badge ${s}`}>{s.toUpperCase()}</span>;
};

const formatTimestamp = (ts) => {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return ts; }
};

const TravelRecords = () => {
  const [travels, setTravels] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filters, setFilters] = useState({ page: 1, limit: 20 });

  useEffect(() => { fetchStudents(); }, []);
  useEffect(() => { fetchTravels(); }, [filters]);

  const fetchStudents = async () => {
    try {
      const res = await api.get('/students');
      setStudents(res.data);
    } catch (e) { console.error(e); }
  };

  const fetchTravels = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(
        Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== undefined && v !== null && v !== ''))
      ).toString();
      const res = await api.get(`/travel?${params}`);
      setTravels(res.data.data);
      setTotalRecords(res.data.total);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

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
            <div style={{ fontWeight: 500, fontSize: 13 }}>{name}</div>
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
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'time',
      render: (ts) => (
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
          {formatTimestamp(ts)}
        </span>
      ),
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      render: (v) => {
        if (!v) return '—';
        const isInbound = v?.toLowerCase() === 'inbound' || v?.toLowerCase() === 'in';
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px',
            borderRadius: 20,
            fontSize: 12, fontWeight: 600,
            background: isInbound ? '#dbeafe' : '#f5f3ff',
            color: isInbound ? '#1d4ed8' : '#6d28d9',
          }}>
            {isInbound
              ? <ArrowDownOutlined style={{ fontSize: 11 }} />
              : <ArrowUpOutlined style={{ fontSize: 11 }} />
            }
            {v}
          </span>
        );
      },
    },
    {
      title: 'Fee Status',
      dataIndex: 'feeStatusAtTime',
      key: 'feeStatus',
      render: (v) => <StatusBadge status={v} />,
      filters: [
        { text: 'Paid', value: 'paid' },
        { text: 'Unpaid', value: 'unpaid' },
      ],
      onFilter: (value, record) => record.feeStatusAtTime === value,
    },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Travel Records</h1>
          <p className="page-subtitle">
            {totalRecords > 0 ? `${totalRecords} total records` : 'Complete boarding log history'}
          </p>
        </div>
        <Tooltip title="Export CSV (coming soon)">
          <Button icon={<DownloadOutlined />} style={{ borderRadius: 10, fontWeight: 600 }} disabled>
            Export CSV
          </Button>
        </Tooltip>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar animate-fade-in-up delay-1">
        <FileTextOutlined style={{ color: 'var(--color-text-muted)', fontSize: 16 }} />
        <RangePicker
          style={{ borderRadius: 10 }}
          onChange={(_, [start, end]) => setFilters(f => ({ ...f, startDate: start, endDate: end, page: 1 }))}
          placeholder={['Start Date', 'End Date']}
        />
        <Select
          placeholder="Filter by Student"
          style={{ width: 220, borderRadius: 10 }}
          allowClear
          showSearch
          optionFilterProp="children"
          onChange={(v) => setFilters(f => ({ ...f, studentId: v, page: 1 }))}
        >
          {students.map(s => (
            <Select.Option key={s._id} value={s._id}>
              {s.firstName} {s.lastName}
            </Select.Option>
          ))}
        </Select>
        <Select
          placeholder="Fee Status"
          style={{ width: 140 }}
          allowClear
          onChange={(v) => setFilters(f => ({ ...f, feeStatus: v, page: 1 }))}
        >
          <Select.Option value="paid">Paid</Select.Option>
          <Select.Option value="unpaid">Unpaid</Select.Option>
        </Select>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchTravels}
          loading={loading}
          style={{ borderRadius: 10 }}
        >
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="premium-card animate-fade-in-up delay-2" style={{ padding: 0, overflow: 'hidden' }}>
        <Table
          dataSource={travels}
          columns={columns}
          loading={loading}
          rowKey="_id"
          pagination={{
            total: totalRecords,
            current: filters.page,
            pageSize: filters.limit,
            onChange: (page) => setFilters(f => ({ ...f, page })),
            showSizeChanger: false,
            showTotal: (total, range) => (
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                {range[0]}–{range[1]} of {total} records
              </span>
            ),
          }}
          locale={{ emptyText: <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No travel records found</div></div> }}
        />
      </div>
    </div>
  );
};

export default TravelRecords;