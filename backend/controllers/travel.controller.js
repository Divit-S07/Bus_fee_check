const TravelRecord = require('../models/TravelRecord');

exports.getAllTravels = async (req, res) => {
  const { page = 1, limit = 20, studentId, busId, startDate, endDate } = req.query;
  const filter = {};
  if (studentId) filter.studentId = studentId;
  if (busId) filter.busId = busId;
  if (startDate && endDate) filter.timestamp = { $gte: new Date(startDate), $lte: new Date(endDate) };
  const travels = await TravelRecord.find(filter)
    .populate('studentId', 'firstName lastName studentId')
    .populate('busId', 'busNumber')
    .sort({ timestamp: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  const total = await TravelRecord.countDocuments(filter);
  res.json({ data: travels, total, page, limit });
};