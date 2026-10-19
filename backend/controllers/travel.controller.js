const TravelRecord = require('../models/TravelRecord');

exports.getAllTravels = async (req, res) => {
  const { page = 1, limit = 20, studentId, busId, startDate, endDate, feeStatus } = req.query;
  const filter = {};
  if (studentId) filter.studentId = studentId;
  if (busId) filter.busId = busId;
  // the "Fee Status" dropdown on the travel page
  if (feeStatus) filter.feeStatusAtTime = feeStatus;
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      // the picker hands over midnight of the end day - stretch it so a single
      // day range (start == end) still shows that whole day
      end.setHours(23, 59, 59, 999);
      filter.timestamp = { $gte: start, $lte: end };
    }
  }
  const travels = await TravelRecord.find(filter)
    .populate('studentId', 'firstName lastName studentId photoUrl faceData')
    .populate('busId', 'busNumber')
    .sort({ timestamp: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  const total = await TravelRecord.countDocuments(filter);
  res.json({ data: travels, total, page, limit });
};