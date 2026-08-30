const Student = require('../models/Student');
const Bus = require('../models/Bus');
const TravelRecord = require('../models/TravelRecord');
const UnpaidTravel = require('../models/UnpaidTravel');

exports.getDashboardStats = async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments({ isActive: true });
    const totalBuses = await Bus.countDocuments({ isActive: true });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todayTravels = await TravelRecord.countDocuments({
      timestamp: { $gte: startOfDay, $lte: endOfDay },
    });

    const unpaidToday = await UnpaidTravel.countDocuments({
      timestamp: { $gte: startOfDay, $lte: endOfDay },
    });

    res.json({
      totalStudents,
      totalBuses,
      todayTravels,
      unpaidToday,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
