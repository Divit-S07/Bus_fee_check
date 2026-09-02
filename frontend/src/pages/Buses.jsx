import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, message, Space, Tag } from 'antd';
import { PlusOutlined, CarOutlined } from '@ant-design/icons';
import api from '../api/client';

const Buses = () => {
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { fetchBuses(); }, []);

  const fetchBuses = async () => {
    setLoading(true);
    try {
      const res = await api.get('/buses');
      setBuses(res.data);
    } catch (e) {
      message.error('Failed to fetch buses');
    }
    setLoading(false);
  };

  const handleOpen = (bus = null) => {
    if (bus) {
      setEditingId(bus._id);
      form.setFieldsValue(bus);
    } else {
      setEditingId(null);
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await api.put(`/buses/${editingId}`, values);
        message.success('Bus updated successfully');
      } else {
        await api.post('/buses', values);
        message.success('Bus added successfully');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingId(null);
      fetchBuses();
    } catch (error) {
      message.error('Operation failed: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this bus? This action cannot be undone.')) {
      try {
        await api.delete(`/buses/${id}`);
        message.success('Bus deleted');
        fetchBuses();
      } catch (e) {
        message.error('Failed to delete bus');
      }
    }
  };

  const activeCount   = buses.filter(b => b.isActive).length;
  const inactiveCount = buses.filter(b => !b.isActive).length;

  const columns = [
    {
      title: 'Bus',
      key: 'busInfo',
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            background: r.isActive ? 'linear-gradient(135deg, #d1fae5, #a7f3d0)' : '#f1f5f9',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <CarOutlined style={{ color: r.isActive ? '#10b981' : '#94a3b8', fontSize: 16 }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{r.busNumber}</div>
            {r.registrationPlate && (
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
                {r.registrationPlate}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Route',
      dataIndex: 'routeName',
      key: 'route',
      render: (v) => v
        ? <Tag color="purple" style={{ borderRadius: 20, fontWeight: 500 }}>{v}</Tag>
        : <span style={{ color: 'var(--color-text-muted)' }}>—</span>,
    },
    {
      title: 'Capacity',
      dataIndex: 'capacity',
      key: 'capacity',
      render: (v) => (
        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {v ?? '—'} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: 12 }}>seats</span>
        </span>
      ),
    },
    {
      title: 'Driver',
      key: 'driver',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{r.driverName || '—'}</div>
          {r.driverPhone && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.driverPhone}</div>}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'status',
      render: (v) => (
        <span className={`status-badge ${v ? 'active' : 'inactive'}`}>
          {v ? 'Active' : 'Inactive'}
        </span>
      ),
      filters: [
        { text: 'Active', value: true },
        { text: 'Inactive', value: false },
      ],
      onFilter: (value, record) => record.isActive === value,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, r) => (
        <Space size={4}>
          <Button type="link" size="small" style={{ fontWeight: 600 }} onClick={() => handleOpen(r)}>Edit</Button>
          <Button type="link" danger size="small" style={{ fontWeight: 600 }} onClick={() => handleDelete(r._id)}>Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Bus Management</h1>
          <p className="page-subtitle">{buses.length} buses in fleet</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpen(null)}
          id="add-bus-btn"
          size="large"
          style={{ borderRadius: 10, fontWeight: 600 }}
        >
          Add Bus
        </Button>
      </div>

      {/* Summary Badges */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ padding: '6px 14px', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 600, color: '#065f46' }}>
          🟢 {activeCount} Active
        </div>
        {inactiveCount > 0 && (
          <div style={{ padding: '6px 14px', background: '#f1f5f9', borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 600, color: '#475569' }}>
            ⚫ {inactiveCount} Inactive
          </div>
        )}
      </div>

      {/* Table */}
      <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table
          dataSource={buses}
          columns={columns}
          loading={loading}
          rowKey="_id"
          locale={{ emptyText: <div className="empty-state"><div className="empty-state-icon">🚌</div><div className="empty-state-text">No buses found</div></div> }}
        />
      </div>

      {/* Add / Edit Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CarOutlined style={{ color: '#fff', fontSize: 15 }} />
            </div>
            <span>{editingId ? 'Edit Bus' : 'Add New Bus'}</span>
          </div>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
        width={500}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="busNumber" label="Bus Number" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="e.g. BUS-01" />
            </Form.Item>
            <Form.Item name="registrationPlate" label="Registration Plate" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="e.g. TN-01-AB-1234" style={{ fontFamily: 'var(--font-mono)' }} />
            </Form.Item>
            <Form.Item name="routeName" label="Route Name" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="e.g. City Centre Route" />
            </Form.Item>
            <Form.Item name="capacity" label="Seating Capacity" rules={[{ required: true, message: 'Required' }]}>
              <InputNumber placeholder="e.g. 40" style={{ width: '100%' }} min={1} max={200} />
            </Form.Item>
            <Form.Item name="driverName" label="Driver Name">
              <Input placeholder="Driver Name" />
            </Form.Item>
            <Form.Item name="driverPhone" label="Driver Phone">
              <Input placeholder="Phone Number" />
            </Form.Item>
          </div>

          <Form.Item name="isActive" label="Bus Status" valuePropName="checked" initialValue={true}>
            <Switch
              checkedChildren="Active"
              unCheckedChildren="Inactive"
              style={{ background: '#10b981' }}
            />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8, borderTop: '1px solid var(--color-border)', marginTop: 8 }}>
            <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" style={{ fontWeight: 600 }}>
              {editingId ? 'Save Changes' : 'Add Bus'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default Buses;