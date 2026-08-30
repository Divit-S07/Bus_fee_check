const Bus = require('../models/Bus');

exports.getAllBuses = async (req, res) => {
  const buses = await Bus.find().populate('assignedStudents', 'firstName lastName studentId');
  res.json(buses);
};
exports.getBusById = async (req, res) => { const bus = await Bus.findById(req.params.id); if (!bus) return res.status(404).json({ message: 'Bus not found' }); res.json(bus); };
exports.createBus = async (req, res) => { const bus = new Bus(req.body); await bus.save(); res.status(201).json(bus); };
exports.updateBus = async (req, res) => { const bus = await Bus.findByIdAndUpdate(req.params.id, req.body, { new: true }); res.json(bus); };
exports.deleteBus = async (req, res) => { await Bus.findByIdAndDelete(req.params.id); res.json({ message: 'Bus deleted' }); };