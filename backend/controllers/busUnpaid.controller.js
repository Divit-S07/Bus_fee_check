const BusUnpaidTracking = require('../models/BusUnpaidTracking');
const UnpaidTravel = require('../models/UnpaidTravel');
const busUnpaidService = require('../services/busUnpaidTracking.service');
const { getIO } = require('../sockets');

/**
 * Get list of bus-wise unpaid records with filtering, searching, and pagination.
 */
exports.getBusUnpaidTracking = async (req, res, next) => {
  try {
    const {
      busId,
      busNumber,
      search,
      status,
      resolved,
      isRepeatOffender,
      startDate,
      endDate,
      minTrips,
      page = 1,
      limit = 50,
      sortBy = 'lastTravelDate',
      sortOrder = 'desc',
    } = req.query;

    const filter = {};

    if (busId) filter.busId = busId;
    if (busNumber) filter.busNumber = busNumber;

    if (resolved !== undefined && resolved !== '') {
      filter.resolved = resolved === 'true' || resolved === true;
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (isRepeatOffender !== undefined && isRepeatOffender !== '') {
      filter.isRepeatOffender = isRepeatOffender === 'true' || isRepeatOffender === true;
    }

    if (minTrips) {
      filter.unpaidTripCount = { $gte: parseInt(minTrips, 10) };
    }

    if (startDate || endDate) {
      filter.lastTravelDate = {};
      if (startDate) filter.lastTravelDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.lastTravelDate.$lte = end;
      }
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { 'studentDetails.fullName': regex },
        { 'studentDetails.studentId': regex },
        { 'studentDetails.department': regex },
        { 'studentDetails.email': regex },
        { busNumber: regex },
        { routeName: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [total, records] = await Promise.all([
      BusUnpaidTracking.countDocuments(filter),
      BusUnpaidTracking.find(filter)
        .populate('busId', 'busNumber routeName capacity registrationNumber driverName')
        .populate('studentId', 'studentId firstName lastName email department batch paymentStatus photoUrl')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      data: records,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Get summary KPI statistics and bus-wise breakdown for the dashboard.
 */
exports.getBusUnpaidSummary = async (req, res, next) => {
  try {
    // Aggregation for bus-wise stats
    const busStats = await BusUnpaidTracking.aggregate([
      {
        $group: {
          _id: { busId: '$busId', busNumber: '$busNumber', routeName: '$routeName' },
          studentCount: { $sum: 1 },
          unresolvedCount: {
            $sum: { $cond: [{ $eq: ['$resolved', false] }, 1, 0] },
          },
          totalUnpaidTrips: { $sum: '$unpaidTripCount' },
          repeatOffendersCount: {
            $sum: { $cond: [{ $eq: ['$isRepeatOffender', true] }, 1, 0] },
          },
          latestTravelDate: { $max: '$lastTravelDate' },
        },
      },
      {
        $project: {
          busId: '$_id.busId',
          busNumber: '$_id.busNumber',
          routeName: '$_id.routeName',
          studentCount: 1,
          unresolvedCount: 1,
          totalUnpaidTrips: 1,
          repeatOffendersCount: 1,
          latestTravelDate: 1,
          _id: 0,
        },
      },
      { $sort: { totalUnpaidTrips: -1 } },
    ]);

    // Overall metrics
    const [totals] = await BusUnpaidTracking.aggregate([
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalUnpaidTrips: { $sum: '$unpaidTripCount' },
          totalUnresolvedRecords: {
            $sum: { $cond: [{ $eq: ['$resolved', false] }, 1, 0] },
          },
          totalRepeatOffenders: {
            $sum: { $cond: [{ $eq: ['$isRepeatOffender', true] }, 1, 0] },
          },
        },
      },
    ]) || [{ totalRecords: 0, totalUnpaidTrips: 0, totalUnresolvedRecords: 0, totalRepeatOffenders: 0 }];

    // Distinct unpaid students count
    const distinctStudents = await BusUnpaidTracking.distinct('studentId');

    const summary = {
      totalUnpaidStudents: distinctStudents.length,
      totalUnpaidTrips: totals?.totalUnpaidTrips || 0,
      totalUnresolvedRecords: totals?.totalUnresolvedRecords || 0,
      totalRepeatOffenders: totals?.totalRepeatOffenders || 0,
      mostAffectedBus: busStats.length > 0 ? busStats[0] : null,
      busStats,
    };

    return res.json({
      success: true,
      summary,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Get single bus unpaid record with full trip history details.
 */
exports.getBusUnpaidById = async (req, res, next) => {
  try {
    const record = await BusUnpaidTracking.findById(req.params.id)
      .populate('studentId')
      .populate('busId')
      .populate('resolvedBy', 'name email');

    if (!record) {
      return res.status(404).json({ message: 'Bus unpaid record not found' });
    }

    return res.json({ success: true, data: record });
  } catch (error) {
    return next(error);
  }
};

/**
 * Resolve an unpaid student's record for a specific bus.
 */
exports.resolveBusUnpaid = async (req, res, next) => {
  try {
    const record = await BusUnpaidTracking.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: 'Bus unpaid record not found' });
    }

    record.resolved = true;
    record.status = 'resolved';
    record.resolvedAt = new Date();
    record.resolvedBy = req.user?._id;
    record.resolutionNotes = req.body.notes || 'Resolved by admin';
    await record.save();

    // Also mark related UnpaidTravel records as resolved
    await UnpaidTravel.updateMany(
      { studentId: record.studentId, busId: record.busId, resolved: false },
      {
        $set: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: req.user?._id,
          resolutionNotes: req.body.notes || 'Resolved via Bus-wise Unpaid Tracking',
        },
      }
    );

    // Notify connected clients via Socket.io
    try {
      getIO().emit('bus-unpaid-resolved', {
        trackingId: record._id,
        studentId: record.studentId,
        busId: record.busId,
        resolvedAt: record.resolvedAt,
      });
    } catch (e) {
      // Non-fatal
    }

    return res.json({ success: true, message: 'Record resolved successfully', data: record });
  } catch (error) {
    return next(error);
  }
};

/**
 * Manually trigger backfill / sync from existing UnpaidTravel collection.
 */
exports.syncUnpaidData = async (req, res, next) => {
  try {
    const result = await busUnpaidService.syncFromExistingUnpaid();
    return res.json({
      success: true,
      message: 'Bus-wise unpaid records synchronized successfully',
      result,
    });
  } catch (error) {
    return next(error);
  }
};

