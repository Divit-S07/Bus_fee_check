import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Input, message } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import api from '../api/client';

const UnpaidTravels = () => {
  const [unpaid, setUnpaid] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolveModal, setResolveModal] = useState({ visible: false, id: null });
  const [resolutionNotes, setResolutionNotes] = useState('');

  useEffect(() => { fetchUnpaid(); }, []);

  const fetchUnpaid = async () => {
    setLoading(true);
    const res = await api.get('/unpaid');
    setUnpaid(res.data);
    setLoading(false);
  };

  const resolveUnpaid = async (id, notes) => {
    try {
      await api.put(`/unpaid/${id}/resolve`, { notes });
      message.success('Resolved');
      setResolveModal({ visible: false, id: null });
      setResolutionNotes('');
      fetchUnpaid();
    } catch (err) {
      message.error('Resolution failed');
    }
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
    { title: 'Reason', dataIndex: 'reason' },
    { title: 'Repeat #', dataIndex: 'repeatCount' },
    { title: 'Resolved', dataIndex: 'resolved', render: v => <Tag color={v ? 'green' : 'red'}>{v ? 'Yes' : 'No'}</Tag> },
    {
      title: 'Actions',
      render: (_, r) => !r.resolved && (
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setResolveModal({ visible: true, id: r._id })}>
          Resolve
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Button onClick={fetchUnpaid} style={{ marginBottom: 16 }}>Refresh</Button>
      <Table dataSource={unpaid} columns={columns} loading={loading} rowKey="_id" />
      <Modal title="Resolve Unpaid Travel" open={resolveModal.visible} onCancel={() => setResolveModal({ visible: false, id: null })} footer={null}>
        <Input.TextArea placeholder="Resolution notes" value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} rows={4} style={{ marginBottom: 16 }} />
        <Button type="primary" onClick={() => resolveUnpaid(resolveModal.id, resolutionNotes)} block>Confirm Resolve</Button>
      </Modal>
    </div>
  );
};

export default UnpaidTravels;