import React, { useState, useEffect } from 'react';
import { Table, Card, DatePicker, Select, Button, Space, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import api from '../api/client';

const { RangePicker } = DatePicker;

const TravelRecords = () => {
  const [travels, setTravels] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filters, setFilters] = useState({ page: 1, limit: 20 });

  useEffect(() => { 
    fetchStudents();
  }, []);

  useEffect(() => { 
    fetchTravels(); 
  }, [filters]);

  const fetchStudents = async () => {
    try {
      const res = await api.get('/students');
      setStudents(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTravels = async () => {
    setLoading(true);
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== undefined && v !== null && v !== ''))
    ).toString();
    const res = await api.get(`/travel?${params}`);
    setTravels(res.data.data);
    setTotalRecords(res.data.total);
    setLoading(false);
  };

  const columns = [
    { 
      title: 'Student', 
      key: 'student', 
      render: (_, r) => r.studentId ? `${r.studentId.firstName || ''} ${r.studentId.lastName || ''}`.trim() || r.studentId.studentId : 'N/A' 
    },
    { 
      title: 'Bus', 
      key: 'bus', 
      render: (_, r) => r.busId?.busNumber || 'N/A' 
    },
    { title: 'Time', dataIndex: 'timestamp' },
    { title: 'Direction', dataIndex: 'direction' },
    { title: 'Fee Status', dataIndex: 'feeStatusAtTime', render: v => <Tag color={v === 'paid' ? 'green' : 'red'}>{v}</Tag> },
  ];

  return (
    <Card title="Travel Records">
      <Space style={{ marginBottom: 16 }}>
        <RangePicker onChange={(_, [start, end]) => setFilters({ ...filters, startDate: start, endDate: end })} />
        <Select placeholder="Filter by Student" style={{ width: 200 }} allowClear onChange={v => setFilters({ ...filters, studentId: v })}>
          {students.map(s => <Select.Option key={s._id} value={s._id}>{s.firstName} {s.lastName}</Select.Option>)}
        </Select>
        <Button icon={<ReloadOutlined />} onClick={fetchTravels}>Refresh</Button>
      </Space>
      <Table dataSource={travels} columns={columns} loading={loading} rowKey="_id" pagination={{ total: totalRecords, current: filters.page, onChange: (page) => setFilters({ ...filters, page }) }} />
    </Card>
  );
};

export default TravelRecords;