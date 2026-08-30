import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag } from 'antd';
import { useWebSocket } from '../hooks/useWebSocket';
import { travelStore } from '../stores/travelStore';
import api from '../api/client';

const Dashboard = () => {
  useWebSocket();
  const { recentTravels, unpaidCount } = travelStore();
  const [stats, setStats] = useState({ totalStudents: 0, totalBuses: 0, todayTravels: 0, unpaidToday: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const res = await api.get('/analytics/dashboard');
      setStats(res.data);
    };
    fetchStats();
  }, []);

  const columns = [
    { title: 'Student', dataIndex: ['studentId', 'firstName'], key: 'student' },
    { title: 'Bus', dataIndex: ['busId', 'busNumber'], key: 'bus' },
    { title: 'Time', dataIndex: 'timestamp', key: 'time' },
    {
      title: 'Status',
      dataIndex: 'feeStatusAtTime',
      key: 'status',
      render: (status) => <Tag color={status === 'paid' ? 'green' : 'red'}>{status.toUpperCase()}</Tag>,
    },
  ];

  return (
    <div>
      <Row gutter={16}>
        <Col span={6}><Card><Statistic title="Total Students" value={stats.totalStudents} /></Card></Col>
        <Col span={6}><Card><Statistic title="Total Buses" value={stats.totalBuses} /></Card></Col>
        <Col span={6}><Card><Statistic title="Today's Travels" value={stats.todayTravels} /></Card></Col>
        <Col span={6}><Card><Statistic title="Unpaid Today" value={stats.unpaidToday} valueStyle={{ color: '#cf1322' }} /></Card></Col>
      </Row>
      <Row style={{ marginTop: 20 }}>
        <Col span={24}>
          <Card title="Recent Travels">
            <Table dataSource={recentTravels} columns={columns} rowKey="_id" pagination={false} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;