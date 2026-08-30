import React, { useState, useEffect } from 'react';
import { Table, Card, DatePicker, Select, Button, Space, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import api from '../api/client';

const { RangePicker } = DatePicker;

const TravelRecords = () => {
  const [travels, setTravels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ page: 1, limit: 20 });

  useEffect(() => { fetchTravels(); }, [filters]);

  const fetchTravels = async () => {
    setLoading(true);
    const params = new URLSearchParams(filters).toString();
    const res = await api.get(`/travel?${params}`);
    setTravels(res.data.data);
    setLoading(false);
  };

  const columns = [
    { title: 'Student', dataIndex: ['studentId', 'firstName'] },
    { title: 'Bus', dataIndex: ['busId', 'busNumber'] },
    { title: 'Time', dataIndex: 'timestamp' },
    { title: 'Direction', dataIndex: 'direction' },
    { title: 'Fee Status', dataIndex: 'feeStatusAtTime', render: v => <Tag color={v === 'paid' ? 'green' : 'red'}>{v}</Tag> },
  ];

  return (
    <Card title="Travel Records">
      <Space style={{ marginBottom: 16 }}>
        <RangePicker onChange={(_, [start, end]) => setFilters({ ...filters, startDate: start, endDate: end })} />
        <Select placeholder="Student ID" allowClear onChange={v => setFilters({ ...filters, studentId: v })}>
          {/* could load students */}
        </Select>
        <Button icon={<ReloadOutlined />} onClick={fetchTravels}>Refresh</Button>
      </Space>
      <Table dataSource={travels} columns={columns} loading={loading} rowKey="_id" pagination={{ total: 100, current: filters.page, onChange: (page) => setFilters({ ...filters, page }) }} />
    </Card>
  );
};

export default TravelRecords;