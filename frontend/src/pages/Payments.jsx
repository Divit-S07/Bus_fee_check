import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/client';

const Payments = () => {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { fetchPayments(); fetchStudents(); }, []);

  const fetchPayments = async () => {
    setLoading(true);
    const res = await api.get('/payments');
    setPayments(res.data);
    setLoading(false);
  };
  const fetchStudents = async () => {
    const res = await api.get('/students');
    setStudents(res.data);
  };

  const handleSubmit = async (values) => {
    try {
      values.paymentDate = values.paymentDate.toDate();
      values.validFrom = values.validFrom.toDate();
      values.validUntil = values.validUntil.toDate();
      if (editingId) {
        await api.put(`/payments/${editingId}`, values);
        message.success('Payment updated');
      } else {
        await api.post('/payments', values);
        message.success('Payment created');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingId(null);
      fetchPayments();
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const columns = [
    { title: 'Student', dataIndex: ['studentId', 'firstName'] },
    { title: 'Amount', dataIndex: 'amount' },
    { title: 'Method', dataIndex: 'paymentMethod' },
    { title: 'Valid From', dataIndex: 'validFrom' },
    { title: 'Valid Until', dataIndex: 'validUntil' },
    { title: 'Status', dataIndex: 'status' },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Button type="link" onClick={() => { setEditingId(r._id); form.setFieldsValue({ ...r, paymentDate: dayjs(r.paymentDate), validFrom: dayjs(r.validFrom), validUntil: dayjs(r.validUntil) }); setModalVisible(true); }}>Edit</Button>
          <Button type="link" danger onClick={async () => { if (window.confirm('Delete?')) { await api.delete(`/payments/${r._id}`); fetchPayments(); } }}>Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalVisible(true); }}>Add Payment</Button>
      <Table dataSource={payments} columns={columns} loading={loading} rowKey="_id" />
      <Modal title={editingId ? 'Edit Payment' : 'Add Payment'} open={modalVisible} onCancel={() => setModalVisible(false)} footer={null}>
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="studentId" rules={[{ required: true }]}>
            <Select placeholder="Student">
              {students.map(s => <Select.Option key={s._id} value={s._id}>{s.firstName} {s.lastName}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="amount" rules={[{ required: true }]}><InputNumber placeholder="Amount" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="paymentMethod" rules={[{ required: true }]}>
            <Select placeholder="Method">
              <Select.Option value="cash">Cash</Select.Option>
              <Select.Option value="card">Card</Select.Option>
              <Select.Option value="bank_transfer">Bank Transfer</Select.Option>
              <Select.Option value="online">Online</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="transactionId" rules={[{ required: true }]}><Input placeholder="Transaction ID" /></Form.Item>
          <Form.Item name="paymentDate" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="validFrom" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="validUntil" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="status" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="paid">Paid</Select.Option>
              <Select.Option value="pending">Pending</Select.Option>
              <Select.Option value="failed">Failed</Select.Option>
              <Select.Option value="refunded">Refunded</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="notes"><Input.TextArea placeholder="Notes" /></Form.Item>
          <Button type="primary" htmlType="submit">Save</Button>
        </Form>
      </Modal>
    </div>
  );
};

export default Payments;