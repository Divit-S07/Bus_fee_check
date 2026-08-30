import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Tag, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import api from '../api/client';

const Students = () => {
  const [students, setStudents] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchStudents();
    fetchBuses();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    const res = await api.get('/students');
    setStudents(res.data);
    setLoading(false);
  };

  const fetchBuses = async () => {
    const res = await api.get('/buses');
    setBuses(res.data);
  };

  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, values);
        message.success('Student updated');
      } else {
        await api.post('/students', values);
        message.success('Student created');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingId(null);
      fetchStudents();
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this student?')) {
      await api.delete(`/students/${id}`);
      fetchStudents();
    }
  };

  const columns = [
    { title: 'Student ID', dataIndex: 'studentId' },
    { title: 'Name', key: 'name', render: (r) => `${r.firstName} ${r.lastName}` },
    { title: 'Bus', dataIndex: ['busId', 'busNumber'] },
    {
      title: 'Face Status',
      dataIndex: 'faceRegistrationStatus',
      render: (s) => <Tag color={s === 'registered' ? 'green' : 'orange'}>{s}</Tag>,
    },
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
        Add Student
      </Button>
      <Table dataSource={students} columns={columns} loading={loading} rowKey="_id" />
      <Modal title={editingId ? 'Edit Student' : 'Add Student'} open={modalVisible} onCancel={() => setModalVisible(false)} footer={null}>
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="studentId" rules={[{ required: true }]}><Input placeholder="Student ID" /></Form.Item>
          <Form.Item name="firstName" rules={[{ required: true }]}><Input placeholder="First Name" /></Form.Item>
          <Form.Item name="lastName" rules={[{ required: true }]}><Input placeholder="Last Name" /></Form.Item>
          <Form.Item name="email" rules={[{ required: true, type: 'email' }]}><Input placeholder="Email" /></Form.Item>
          <Form.Item name="phone"><Input placeholder="Phone" /></Form.Item>
          <Form.Item name="class"><Input placeholder="Class" /></Form.Item>
          <Form.Item name="department"><Input placeholder="Department" /></Form.Item>
          <Form.Item name="busId" rules={[{ required: true }]}>
            <Select placeholder="Select Bus">
              {buses.map(b => <Select.Option key={b._id} value={b._id}>{b.busNumber}</Select.Option>)}
            </Select>
          </Form.Item>
          <Button type="primary" htmlType="submit">Save</Button>
        </Form>
      </Modal>
    </div>
  );
};

export default Students;