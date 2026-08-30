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
exports.getWeeklyReport = async (req, res) => {
  const { startDate } = req.query;
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const total = await TravelRecord.countDocuments({ timestamp: { $gte: start, $lte: end } });
  const unpaid = await UnpaidTravel.countDocuments({ timestamp: { $gte: start, $lte: end } });
  res.json({ startDate: start, endDate: end, total, unpaid, compliance: total > 0 ? ((total - unpaid) / total * 100).toFixed(2) : 0 });
};

exports.getMonthlyReport = async (req, res) => {
  const { year, month } = req.query;
  const targetYear = year ? parseInt(year) : new Date().getFullYear();
  const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();
  const start = new Date(targetYear, targetMonth, 1);
  const end = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
  const total = await TravelRecord.countDocuments({ timestamp: { $gte: start, $lte: end } });
  const unpaid = await UnpaidTravel.countDocuments({ timestamp: { $gte: start, $lte: end } });
  res.json({ year: targetYear, month: targetMonth + 1, total, unpaid, compliance: total > 0 ? ((total - unpaid) / total * 100).toFixed(2) : 0 });
};