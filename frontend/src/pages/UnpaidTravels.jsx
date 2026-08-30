import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Input, message } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import api from '../api/client';

const UnpaidTravels = () => {
  const [unpaid, setUnpaid] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolveModal, setResolveModal] = useState({ visible: false, id: null });

  useEffect(() => { fetchUnpaid(); }, []);

  const fetchUnpaid = async () => {
    setLoading(true);
    const res = await api.get('/unpaid');
    setUnpaid(res.data);
    setLoading(false);
  };

  const resolveUnpaid = async (id, notes) => {
    await api.put(`/unpaid/${id}/resolve`, { notes });
    message.success('Resolved');
    setResolveModal({ visible: false, id: null });
    fetchUnpaid();
  };

  const columns = [
    { title: 'Student', dataIndex: ['studentId', 'firstName'] },
    { title: 'Bus', dataIndex: ['busId', 'busNumber'] },
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
      <Modal title="Resolve Unpaid" open={resolveModal.visible} onCancel={() => setResolveModal({ visible: false, id: null })} footer={null}>
        <Input.TextArea placeholder="Resolution notes" id="notes" />
        <Button type="primary" onClick={() => resolveUnpaid(resolveModal.id, document.getElementById('notes').value)}>Confirm Resolve</Button>
      </Modal>
    </div>
  );
};

export default UnpaidTravels;