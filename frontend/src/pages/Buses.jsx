import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, message, Tag, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
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
    const res = await api.get('/buses');
    setBuses(res.data);
    setLoading(false);
  };

  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await api.put(`/buses/${editingId}`, values);
        message.success('Bus updated');
      } else {
        await api.post('/buses', values);
        message.success('Bus created');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingId(null);
      fetchBuses();
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this bus?')) {
      await api.delete(`/buses/${id}`);
      fetchBuses();
    }
  };

  const columns = [
    { title: 'Bus Number', dataIndex: 'busNumber' },
    { title: 'Route', dataIndex: 'routeName' },
    { title: 'Capacity', dataIndex: 'capacity' },
    { title: 'Driver', dataIndex: 'driverName' },
    { title: 'Status', dataIndex: 'isActive', render: v => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Button type="link" onClick={() => { setEditingId(r._id); form.setFieldsValue(r); setModalVisible(true); }}>Edit</Button>
          <Button type="link" danger onClick={() => handleDelete(r._id)}>Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalVisible(true); }}>
        Add Bus
      </Button>
      <Table dataSource={buses} columns={columns} loading={loading} rowKey="_id" />
      <Modal title={editingId ? 'Edit Bus' : 'Add Bus'} open={modalVisible} onCancel={() => setModalVisible(false)} footer={null}>
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="busNumber" rules={[{ required: true }]}><Input placeholder="Bus Number" /></Form.Item>
          <Form.Item name="registrationPlate" rules={[{ required: true }]}><Input placeholder="Plate" /></Form.Item>
          <Form.Item name="capacity" rules={[{ required: true }]}><InputNumber placeholder="Capacity" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="routeName" rules={[{ required: true }]}><Input placeholder="Route Name" /></Form.Item>
          <Form.Item name="driverName"><Input placeholder="Driver Name" /></Form.Item>
          <Form.Item name="driverPhone"><Input placeholder="Driver Phone" /></Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit">Save</Button>
        </Form>
      </Modal>
    </div>
  );
};

export default Buses;