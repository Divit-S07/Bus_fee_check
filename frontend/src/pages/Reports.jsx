import React, { useState } from 'react';
import { Card, DatePicker, Button, Row, Col, Statistic, Space } from 'antd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/client';

const Reports = () => {
  const [date, setDate] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    if (!date) return;
    setLoading(true);
    const res = await api.get(`/reports/daily?date=${date.format('YYYY-MM-DD')}`);
    setReport(res.data);
    setLoading(false);
  };

  return (
    <div>
      <Card>
        <Space>
          <DatePicker onChange={setDate} />
          <Button type="primary" onClick={generateReport} loading={loading}>Generate Daily Report</Button>
        </Space>
      </Card>
      {report && (
        <>
          <Row gutter={16} style={{ marginTop: 20 }}>
            <Col span={8}><Statistic title="Total Travels" value={report.total} /></Col>
            <Col span={8}><Statistic title="Unpaid" value={report.unpaid} valueStyle={{ color: '#cf1322' }} /></Col>
            <Col span={8}><Statistic title="Compliance %" value={report.compliance} suffix="%" /></Col>
          </Row>
          <Card title="Trend (placeholder)" style={{ marginTop: 20 }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={[{ day: 'Mon', total: 120 }, { day: 'Tue', total: 150 }]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#1890ff" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  );
};

export default Reports;