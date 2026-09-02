import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Avatar, Upload, Tag } from 'antd';
import {
  PlusOutlined,
  UserOutlined,
  UploadOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const StatusBadge = ({ status }) => {
  const s = (status || 'paid').toLowerCase();
  return <span className={`status-badge ${s}`}>{s.toUpperCase()}</span>;
};

const FaceBadge = ({ status }) => {
  const s = status || 'not_registered';
  return <span className={`status-badge ${s}`}>{s === 'registered' ? 'Face Registered' : 'Not Registered'}</span>;
};

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
      form.setFieldsValue({ ...student, busId: busIdVal });
      setPhotoPreview(student.photoUrl || student.faceData?.referenceImageUrl || '');
    } else {
      setEditingId(null);
      form.resetFields();
      setPhotoPreview('');
    }
    setModalVisible(true);
  };

  const handlePhotoUpload = (file) => {
    if (!file.type.startsWith('image/')) {
      message.error('Only image files are allowed!');
      return false;
    }
    if (file.size / 1024 / 1024 >= 5) {
      message.error('Image must be smaller than 5MB!');
      return false;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      form.setFieldsValue({ photoUrl: e.target.result });
      setPhotoPreview(e.target.result);
    };
    reader.readAsDataURL(file);
    return false;
  };

  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, values);
        message.success('Student updated successfully');
      } else {
        await api.post('/students', values);
        message.success('Student added successfully');
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
    if (window.confirm('Delete this student? This action cannot be undone.')) {
      try {
        await api.delete(`/students/${id}`);
        message.success('Student deleted');
        fetchStudents();
      } catch (err) {
        message.error('Failed to delete student');
      }
    }
  };

  // Summary counts
  const paidCount    = students.filter(s => (s.paymentStatus || 'paid') === 'paid').length;
  const unpaidCount  = students.filter(s => s.paymentStatus === 'unpaid').length;
  const pendingCount = students.filter(s => s.paymentStatus === 'pending').length;

  const columns = [
    {
      title: 'Student',
      key: 'student',
      render: (r) => {
        const name = `${r.firstName} ${r.lastName}`;
        const initials = `${r.firstName?.[0] ?? ''}${r.lastName?.[0] ?? ''}`.toUpperCase();
        return (
          <div className="student-name-cell">
            <Avatar
              src={r.photoUrl || r.faceData?.referenceImageUrl}
              size={36}
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', fontSize: 13, fontWeight: 700, flexShrink: 0 }}
            >
              {initials}
            </Avatar>
            <div>
              <div className="name-text">{name}</div>
              <div className="id-text">{r.studentId}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Class / Dept',
      key: 'classDept',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{r.class || '—'}</div>
          {r.department && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.department}</div>}
        </div>
      ),
    },
    {
      title: 'Bus',
      key: 'bus',
      render: (r) => r.busId?.busNumber
        ? <Tag color="blue" style={{ fontWeight: 600 }}>{r.busId.busNumber}</Tag>
        : <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Not assigned</span>,
    },
    {
      title: 'Contact',
      key: 'contact',
      render: (r) => (
        <div>
          <div style={{ fontSize: 13 }}>{r.email || '—'}</div>
          {r.phone && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.phone}</div>}
        </div>
      ),
    },
    {
      title: 'Fee Status',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      render: (s) => <StatusBadge status={s || 'paid'} />,
      filters: [
        { text: 'Paid', value: 'paid' },
        { text: 'Unpaid', value: 'unpaid' },
        { text: 'Pending', value: 'pending' },
      ],
      onFilter: (value, record) => (record.paymentStatus || 'paid') === value,
    },
    {
      title: 'Face Status',
      dataIndex: 'faceRegistrationStatus',
      key: 'faceStatus',
      render: (s) => <FaceBadge status={s} />,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, r) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            style={{ fontWeight: 600, padding: '2px 8px' }}
            onClick={() => handleModalOpen(r)}
          >
            Edit
          </Button>
          <Button
            type="link"
            danger
            size="small"
            style={{ fontWeight: 600, padding: '2px 8px' }}
            onClick={() => handleDelete(r._id)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Student Management</h1>
          <p className="page-subtitle">
            {students.length} students enrolled
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleModalOpen(null)}
          id="add-student-btn"
          size="large"
          style={{ borderRadius: 10, fontWeight: 600 }}
        >
          Add Student
        </Button>
      </div>

      {/* Summary Badges */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-full)', fontSize: 13 }}>
          <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />
          <span style={{ fontWeight: 600, color: '#065f46' }}>{paidCount} Paid</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--color-danger-bg)', borderRadius: 'var(--radius-full)', fontSize: 13 }}>
          <CloseCircleOutlined style={{ color: 'var(--color-danger)' }} />
          <span style={{ fontWeight: 600, color: '#991b1b' }}>{unpaidCount} Unpaid</span>
        </div>
        {pendingCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--color-warning-bg)', borderRadius: 'var(--radius-full)', fontSize: 13 }}>
            <ClockCircleOutlined style={{ color: 'var(--color-warning)' }} />
            <span style={{ fontWeight: 600, color: '#92400e' }}>{pendingCount} Pending</span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table
          dataSource={students}
          columns={columns}
          loading={loading}
          rowKey="_id"
          locale={{ emptyText: <div className="empty-state"><div className="empty-state-icon"><TeamOutlined /></div><div className="empty-state-text">No students found</div></div> }}
        />
      </div>

      {/* Add / Edit Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserOutlined style={{ color: '#fff', fontSize: 15 }} />
            </div>
            <span>{editingId ? 'Edit Student' : 'Add New Student'}</span>
          </div>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
        width={560}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical" style={{ marginTop: 16 }}>
          {/* Photo Upload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, padding: 14, background: 'var(--color-bg)', borderRadius: 10 }}>
            <Avatar
              src={photoPreview}
              icon={<UserOutlined />}
              size={64}
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', flexShrink: 0 }}
            />
            <div>
              <Upload beforeUpload={handlePhotoUpload} showUploadList={false} accept="image/*">
                <Button icon={<UploadOutlined />} size="small" style={{ fontWeight: 500 }}>Upload Photo</Button>
              </Upload>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                JPG, PNG · Max 5MB · Or enter URL below
              </div>
            </div>
          </div>

          <Form.Item name="photoUrl" label="Photo URL">
            <Input placeholder="https://example.com/photo.jpg" onChange={(e) => setPhotoPreview(e.target.value)} />
          </Form.Item>

          {/* Two-column layout for main fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="studentId" label="Student ID" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="e.g. STU101" />
            </Form.Item>
            <Form.Item name="class" label="Class">
              <Input placeholder="e.g. 10th / CSE-3" />
            </Form.Item>
            <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="First Name" />
            </Form.Item>
            <Form.Item name="lastName" label="Last Name" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="Last Name" />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
              <Input placeholder="student@email.com" />
            </Form.Item>
            <Form.Item name="phone" label="Phone">
              <Input placeholder="Phone Number" />
            </Form.Item>
          </div>

          <Form.Item name="department" label="Department">
            <Input placeholder="Department" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="busId" label="Assigned Bus" rules={[{ required: true, message: 'Required' }]}>
              <Select placeholder="Select Bus">
                {buses.map((b) => (
                  <Select.Option key={b._id} value={b._id}>
                    {b.busNumber}{b.routeName ? ` (${b.routeName})` : ''}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="paymentStatus" label="Payment Status" initialValue="paid">
              <Select>
                <Select.Option value="paid">✅ Paid</Select.Option>
                <Select.Option value="unpaid">❌ Unpaid</Select.Option>
                <Select.Option value="pending">⏳ Pending</Select.Option>
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8, borderTop: '1px solid var(--color-border)', marginTop: 8 }}>
            <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" style={{ fontWeight: 600 }}>
              {editingId ? 'Save Changes' : 'Add Student'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default Students;