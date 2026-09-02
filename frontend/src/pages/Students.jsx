import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Tag, Space, Avatar, Upload } from 'antd';
import { PlusOutlined, UserOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../api/client';

const Students = () => {
  const [students, setStudents] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');

  useEffect(() => {
    fetchStudents();
    fetchBuses();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await api.get('/students');
      setStudents(res.data);
    } catch (err) {
      message.error('Failed to fetch students');
    }
    setLoading(false);
  };

  const fetchBuses = async () => {
    try {
      const res = await api.get('/buses');
      setBuses(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleModalOpen = (student = null) => {
    if (student) {
      setEditingId(student._id);
      const busIdVal = typeof student.busId === 'object' ? student.busId?._id : student.busId;
      form.setFieldsValue({
        ...student,
        busId: busIdVal,
      });
      setPhotoPreview(student.photoUrl || student.faceData?.referenceImageUrl || '');
    } else {
      setEditingId(null);
      form.resetFields();
      setPhotoPreview('');
    }
    setModalVisible(true);
  };

  const handlePhotoUpload = (file) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error('You can only upload image files!');
      return false;
    }
    const isLt2M = file.size / 1024 / 1024 < 5;
    if (!isLt2M) {
      message.error('Image must be smaller than 5MB!');
      return false;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Url = e.target.result;
      form.setFieldsValue({ photoUrl: base64Url });
      setPhotoPreview(base64Url);
    };
    reader.readAsDataURL(file);
    return false; // Prevent default submit upload action
  };

  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, values);
        message.success('Student updated successfully');
      } else {
        await api.post('/students', values);
        message.success('Student created successfully');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingId(null);
      setPhotoPreview('');
      fetchStudents();
    } catch (error) {
      message.error('Operation failed: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this student?')) {
      try {
        await api.delete(`/students/${id}`);
        message.success('Student deleted');
        fetchStudents();
      } catch (err) {
        message.error('Failed to delete student');
      }
    }
  };

  const columns = [
    {
      title: 'Photo',
      key: 'photo',
      render: (r) => (
        <Avatar
          src={r.photoUrl || r.faceData?.referenceImageUrl}
          icon={<UserOutlined />}
          size="large"
          style={{ backgroundColor: '#1890ff' }}
        />
      ),
    },
    { title: 'Student ID', dataIndex: 'studentId' },
    { title: 'Name', key: 'name', render: (r) => `${r.firstName} ${r.lastName}` },
    {
      title: 'Bus',
      key: 'bus',
      render: (r) => r.busId?.busNumber || 'N/A',
    },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Class', dataIndex: 'class' },
    {
      title: 'Payment Status',
      dataIndex: 'paymentStatus',
      render: (s) => {
        const color = s === 'paid' ? 'green' : s === 'unpaid' ? 'red' : 'orange';
        return <Tag color={color}>{(s || 'paid').toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Face Status',
      dataIndex: 'faceRegistrationStatus',
      render: (s) => <Tag color={s === 'registered' ? 'green' : 'orange'}>{s || 'not_registered'}</Tag>,
    },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Button type="link" onClick={() => handleModalOpen(r)}>Edit</Button>
          <Button type="link" danger onClick={() => handleDelete(r._id)}>Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Student Management</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleModalOpen(null)}>
          Add Student
        </Button>
      </div>

      <Table dataSource={students} columns={columns} loading={loading} rowKey="_id" />

      <Modal
        title={editingId ? 'Edit Student' : 'Add Student Details'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <Avatar
              src={photoPreview}
              icon={<UserOutlined />}
              size={64}
              style={{ backgroundColor: '#1890ff' }}
            />
            <div>
              <Upload beforeUpload={handlePhotoUpload} showUploadList={false} accept="image/*">
                <Button icon={<UploadOutlined />}>Upload Student Photo</Button>
              </Upload>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Select a photo file or enter URL below</div>
            </div>
          </div>

          <Form.Item
            name="photoUrl"
            label="Photo URL (or Upload Above)"
          >
            <Input
              placeholder="https://example.com/photo.jpg or uploaded photo string"
              onChange={(e) => setPhotoPreview(e.target.value)}
            />
          </Form.Item>

          <Form.Item name="studentId" label="Student ID" rules={[{ required: true }]}>
            <Input placeholder="Student ID (e.g. STU101)" />
          </Form.Item>
          <Form.Item name="firstName" label="First Name" rules={[{ required: true }]}>
            <Input placeholder="First Name" />
          </Form.Item>
          <Form.Item name="lastName" label="Last Name" rules={[{ required: true }]}>
            <Input placeholder="Last Name" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="Email Address" />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input placeholder="Phone Number" />
          </Form.Item>
          <Form.Item name="class" label="Class">
            <Input placeholder="Class (e.g. 10th Standard / CSE-3)" />
          </Form.Item>
          <Form.Item name="department" label="Department">
            <Input placeholder="Department" />
          </Form.Item>
          <Form.Item name="busId" label="Assigned Bus" rules={[{ required: true }]}>
            <Select placeholder="Select Bus">
              {buses.map((b) => (
                <Select.Option key={b._id} value={b._id}>
                  {b.busNumber} {b.routeName ? `(${b.routeName})` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="paymentStatus" label="Payment Status" initialValue="paid">
            <Select placeholder="Select Payment Status">
              <Select.Option value="paid">Paid</Select.Option>
              <Select.Option value="unpaid">Unpaid</Select.Option>
              <Select.Option value="pending">Pending</Select.Option>
            </Select>
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">Save Student</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default Students;