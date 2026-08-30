const TravelRecord = require('../models/TravelRecord');
const UnpaidTravel = require('../models/UnpaidTravel');

exports.getDailyReport = async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ message: 'Date required' });
  const start = new Date(date);
  start.setHours(0,0,0,0);
  const end = new Date(date);
  end.setHours(23,59,59,999);
  const total = await TravelRecord.countDocuments({ timestamp: { $gte: start, $lte: end } });
  const unpaid = await UnpaidTravel.countDocuments({ timestamp: { $gte: start, $lte: end } });
  res.json({ date, total, unpaid, compliance: total > 0 ? ((total - unpaid) / total * 100).toFixed(2) : 0 });
};
exports.getWeeklyReport = async (req, res) => { /* similar */ };
exports.getMonthlyReport = async (req, res) => { /* similar */ };