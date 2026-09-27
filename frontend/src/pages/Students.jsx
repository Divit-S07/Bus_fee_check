import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Space, Avatar, Upload, Tag, Alert } from 'antd';
import {
  PlusOutlined,
  UserOutlined,
  UploadOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
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
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [receiptFileList, setReceiptFileList] = useState([]);
  const [uploadingReceipts, setUploadingReceipts] = useState(false);
  const [receiptResults, setReceiptResults] = useState(null);

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
        phonenumber: student.phonenumber || student.phone || '',
      });
      setPhotoPreview(student.photoUrl || student.faceData?.referenceImageUrl || '');
    } else {
      setEditingId(null);
      form.resetFields();
      setPhotoPreview('');
    }
    setModalVisible(true);
  };

  const handleValuesChange = (changed, all) => {
    if (changed.busId) {
      const bus = buses.find((b) => b._id === changed.busId);
      if (bus?.routeName) form.setFieldsValue({ busRoute: bus.routeName });
    }
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

  // Fee receipt upload
  const openReceiptModal = () => {
    setReceiptFileList([]);
    setReceiptResults(null);
    setReceiptModalVisible(true);
  };

  const handleReceiptUpload = async () => {
    if (receiptFileList.length === 0) {
      message.warning('Select at least one receipt image');
      return;
    }
    setUploadingReceipts(true);
    try {
      const formData = new FormData();
      receiptFileList.forEach((f) => formData.append('receipts', f));
      const res = await api.post('/receipts/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setReceiptResults(res.data);
      const matched = res.data.results.filter((r) => r.status === 'matched').length;
      message.success(res.data.message || `${matched} receipt(s) matched`);
      setReceiptFileList([]);
      fetchStudents();
    } catch (error) {
      message.error('Upload failed: ' + (error.response?.data?.message || error.message));
    }
    setUploadingReceipts(false);
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
              <div className="id-text">{r.rollnumber || r.studentId}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Program / Batch',
      key: 'programBatch',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{r.program || '—'}</div>
          {r.batch && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.batch}</div>}
        </div>
      ),
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
      title: 'Bus / Route',
      key: 'bus',
      render: (r) => (
        <div>
          {r.busId?.busNumber ? (
            <Tag color="blue" style={{ fontWeight: 600 }}>{r.busId.busNumber}</Tag>
          ) : (
            <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Not assigned</span>
          )}
          {r.busRoute && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{r.busRoute}</div>}
        </div>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      render: (r) => (
        <div>
          <div style={{ fontSize: 13 }}>{r.email || '—'}</div>
          {r.phonenumber && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.phonenumber}</div>}
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
        <Space size={10}>
          <Button
            icon={<FileTextOutlined />}
            onClick={openReceiptModal}
            id="upload-receipt-btn"
            size="large"
            style={{ borderRadius: 10, fontWeight: 600 }}
          >
            Upload Fee Receipt
          </Button>
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
        </Space>
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
        width={640}
      >
        <Form
          form={form}
          onFinish={handleSubmit}
          onValuesChange={handleValuesChange}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
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
            <Form.Item name="rollnumber" label="Roll Number">
              <Input placeholder="e.g. 21CSE045" />
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
            <Form.Item
              name="phonenumber"
              label="Phone Number"
              rules={[{ pattern: /^[0-9+\-\s()]*$/, message: 'Invalid phone number' }]}
            >
              <Input placeholder="e.g. +91 98765 43210" />
            </Form.Item>
            <Form.Item name="program" label="Program">
              <Input placeholder="e.g. B.Tech / MBA" />
            </Form.Item>
            <Form.Item name="batch" label="Batch">
              <Input placeholder="e.g. 2023-2027" />
            </Form.Item>
            <Form.Item name="class" label="Class">
              <Input placeholder="e.g. 10th / CSE-3" />
            </Form.Item>
            <Form.Item name="department" label="Department">
              <Input placeholder="Department" />
            </Form.Item>
          </div>

          {/* Transport details */}
          <div
            style={{
              marginBottom: 16,
              padding: '12px 14px 4px',
              background: 'var(--color-bg)',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', marginBottom: 4 }}>
              Transport Details
            </div>
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
              <Form.Item name="busRoute" label="Bus Route">
                <Select
                  placeholder="Select or type route"
                  showSearch
                  allowClear
                  options={Array.from(new Set(buses.map((b) => b.routeName).filter(Boolean))).map((r) => ({
                    value: r,
                    label: r,
                  }))}
                />
              </Form.Item>
              <Form.Item name="transportFee" label="Transport Fee (₹)">
                <InputNumber placeholder="e.g. 5000" style={{ width: '100%' }} min={0} step={100} />
              </Form.Item>
              <Form.Item name="validityPeriod" label="Validity Period">
                <Select
                  placeholder="Select validity"
                  allowClear
                  options={[
                    { value: '1 Month', label: '1 Month' },
                    { value: '3 Months', label: '3 Months' },
                    { value: '6 Months', label: '6 Months' },
                    { value: '1 Year', label: '1 Year' },
                    { value: 'Academic Year', label: 'Academic Year' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="boardingPoint" label="Boarding Point" style={{ gridColumn: '1 / -1' }}>
                <Input placeholder="e.g. Main Gate, City Centre" />
              </Form.Item>
            </div>
          </div>

          <Form.Item name="paymentStatus" label="Payment Status" initialValue="paid">
            <Select>
              <Select.Option value="paid">✅ Paid</Select.Option>
              <Select.Option value="unpaid">❌ Unpaid</Select.Option>
              <Select.Option value="pending">⏳ Pending</Select.Option>
            </Select>
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8, borderTop: '1px solid var(--color-border)', marginTop: 8 }}>
            <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" style={{ fontWeight: 600 }}>
              {editingId ? 'Save Changes' : 'Add Student'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Upload Fee Receipt Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileTextOutlined style={{ color: '#fff', fontSize: 15 }} />
            </div>
            <span>Upload Fee Receipt</span>
          </div>
        }
        open={receiptModalVisible}
        onCancel={() => setReceiptModalVisible(false)}
        footer={null}
        destroyOnClose
        width={760}
      >
        <div style={{ marginTop: 16 }}>
          <Alert
            type="info"
            showIcon
            message="How it works"
            description="Upload one or more receipt files (image, PDF or DOCX). The system reads the receipt, extracts the receipt image and the student photo (the small rectangle box around it) and stores them in the database. If the student already exists (matched by Student ID / Roll No / Email / Phone / Name), only the fee status and bus route are updated. If the student is not found, a new student record is created from the receipt data with the extracted photo."
            style={{ marginBottom: 16 }}
          />

          <Upload.Dragger
            multiple
            accept="image/*,.pdf,.docx"
            fileList={receiptFileList}
            beforeUpload={(file) => {
              const name = file.name.toLowerCase();
              const ok =
                file.type.startsWith('image/') ||
                file.type === 'application/pdf' ||
                file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                name.endsWith('.pdf') ||
                name.endsWith('.docx');
              if (!ok) {
                message.error('Only image, PDF or DOCX files are allowed!');
                return Upload.LIST_IGNORE;
              }
              if (name.endsWith('.doc')) {
                message.error('.doc is not supported — please save as .docx, PDF or image');
                return Upload.LIST_IGNORE;
              }
              if (file.size / 1024 / 1024 >= 10) {
                message.error('File must be smaller than 10MB!');
                return Upload.LIST_IGNORE;
              }
              setReceiptFileList((prev) => [...prev, file]);
              return false;
            }}
            onRemove={(file) => setReceiptFileList((prev) => prev.filter((f) => f.uid !== file.uid))}
            itemRender={() => null}
            style={{ paddingBottom: 8 }}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">Click or drag receipt files here</p>
            <p className="ant-upload-hint">Images (JPG/PNG), PDF, DOCX · Max 10MB each · Multiple files allowed</p>
          </Upload.Dragger>

          {receiptFileList.length > 0 && (
            <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--color-text-muted)' }}>
              {receiptFileList.length} file(s) selected
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
            <Button onClick={() => setReceiptModalVisible(false)}>Close</Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={uploadingReceipts}
              onClick={handleReceiptUpload}
              disabled={receiptFileList.length === 0}
              style={{ fontWeight: 600 }}
            >
              {uploadingReceipts ? 'Reading Receipts…' : 'Upload & Read'}
            </Button>
          </div>

          {receiptResults && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
                Results — {receiptResults.message}
              </div>
              <Table
                size="small"
                rowKey={(r, i) => `${r.fileName}-${i}`}
                dataSource={receiptResults.results}
                pagination={false}
                columns={[
                  {
                    title: 'File',
                    dataIndex: 'fileName',
                    render: (v) => <span style={{ fontSize: 12 }}>{v}</span>,
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    render: (s) =>
                      s === 'matched' ? (
                        <Tag color="green" style={{ fontWeight: 600 }}>PAID · UPDATED</Tag>
                      ) : s === 'created' ? (
                        <Tag color="purple" style={{ fontWeight: 600 }}>NEW STUDENT</Tag>
                      ) : s === 'unmatched' ? (
                        <Tag color="orange" style={{ fontWeight: 600 }}>SAVED · UNMATCHED</Tag>
                      ) : (
                        <Tag color="red" style={{ fontWeight: 600 }}>ERROR</Tag>
                      ),
                  },
                  {
                    title: 'Receipt #',
                    dataIndex: 'receiptNumber',
                    render: (v) => v || '—',
                  },
                  {
                    title: 'Image',
                    key: 'image',
                    render: (_, r) =>
                      r.hasImage && r.receiptId ? (
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, fontWeight: 600 }}
                          onClick={async () => {
                            try {
                              const res = await api.get(`/receipts/${r.receiptId}/image`, { responseType: 'blob' });
                              const url = URL.createObjectURL(res.data);
                              window.open(url, '_blank');
                            } catch {
                              message.error('Could not load receipt image');
                            }
                          }}
                        >
                          View
                        </Button>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>
                      ),
                  },
                  {
                    title: 'Amount',
                    dataIndex: 'amount',
                    render: (v) => (v != null ? `₹${v}` : '—'),
                  },
                  {
                    title: 'Student Photo',
                    key: 'studentPhoto',
                    render: (_, r) =>
                      r.hasStudentPhoto && r.receiptId ? (
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, fontWeight: 600 }}
                          onClick={async () => {
                            try {
                              const res = await api.get(`/receipts/${r.receiptId}/photo`, { responseType: 'blob' });
                              const url = URL.createObjectURL(res.data);
                              window.open(url, '_blank');
                            } catch {
                              message.error('Could not load extracted student photo');
                            }
                          }}
                        >
                          View
                        </Button>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>
                      ),
                  },
                  {
                    title: 'Student',
                    key: 'student',
                    render: (_, r) =>
                      r.student ? (
                        <div>
                          <span style={{ fontSize: 12 }}>
                            {r.student.name}
                            <span style={{ color: 'var(--color-text-muted)' }}> ({r.student.studentId})</span>
                          </span>
                          {r.busRoute && (
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Route: {r.busRoute}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {r.status === 'error' ? r.message : 'Not found — saved for review'}
                        </span>
                      ),
                  },
                ]}
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Students;