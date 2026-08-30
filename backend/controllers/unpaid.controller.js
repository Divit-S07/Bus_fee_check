const UnpaidTravel = require('../models/UnpaidTravel');

exports.getUnpaidTravels = async (req, res) => {
  const { resolved, studentId } = req.query;
  const filter = {};
  if (resolved !== undefined) filter.resolved = resolved === 'true';
  if (studentId) filter.studentId = studentId;
  const unpaid = await UnpaidTravel.find(filter)
    .populate('studentId', 'firstName lastName studentId')
    .populate('busId', 'busNumber')
    .sort({ timestamp: -1 });
  res.json(unpaid);
};
exports.resolveUnpaid = async (req, res) => {
  const unpaid = await UnpaidTravel.findById(req.params.id);
  if (!unpaid) return res.status(404).json({ message: 'Unpaid record not found' });
  unpaid.resolved = true;
  unpaid.resolvedAt = new Date();
  unpaid.resolvedBy = req.user._id;
  unpaid.resolutionNotes = req.body.notes || 'Resolved by admin';
  await unpaid.save();
  res.json(unpaid);
};
exports.getRepeatOffenders = async (req, res) => {
  const offenders = await UnpaidTravel.aggregate([
    { $match: { resolved: false } },
    { $group: { _id: '$studentId', count: { $sum: 1 } } },
    { $match: { count: { $gte: 3 } } },
    { $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 'student' } },
    { $unwind: '$student' },
    { $project: { student: 1, count: 1 } }
  ]);
  res.json(offenders);
};