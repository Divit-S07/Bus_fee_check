const BusUnpaidTracking = require('../models/BusUnpaidTracking');
const UnpaidTravel = require('../models/UnpaidTravel');
const Student = require('../models/Student');
const Bus = require('../models/Bus');
const { getIO } = require('../sockets');

/**
 * Record an unpaid boarding event into the BusUnpaidTracking collection.
 * Called automatically when face recognition identifies an unpaid student.
 */
async function recordUnpaidBoarding(student, bus, travel, unpaid) {
  try {
    const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.studentId;
    const studentDetails = {
      studentId: student.studentId,
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      fullName,
      department: student.department || '',
      batch: student.batch || '',
      phonenumber: student.phonenumber || '',
      email: student.email || '',
      photoUrl: student.photoUrl || student.faceData?.referenceImageUrl || '',
    };

    // Calculate total unresolved unpaid trips for this student across all buses
    const totalUnresolved = await UnpaidTravel.countDocuments({
      studentId: student._id,
      resolved: false,
    });
    const totalAcrossBuses = Math.max(totalUnresolved, unpaid.repeatCount || 1);

    const tripItem = {
      travelRecordId: travel._id,
      unpaidTravelId: unpaid._id,
      timestamp: travel.timestamp || new Date(),
      reason: unpaid.reason || 'no_payment',
      confidenceScore: unpaid.confidenceScore,
    };

    // Find existing bus tracking record
    let tracking = await BusUnpaidTracking.findOne({
      studentId: student._id,
      busId: bus._id,
    });

    if (tracking) {
      tracking.unpaidTripCount += 1;
      tracking.totalUnpaidTripsAcrossBuses = totalAcrossBuses;
      tracking.lastTravelDate = travel.timestamp || new Date();
      tracking.busNumber = bus.busNumber;
      tracking.routeName = bus.routeName || tracking.routeName || '';
      tracking.studentDetails = studentDetails;
      tracking.status = 'unresolved';
      tracking.resolved = false;
      tracking.isRepeatOffender = tracking.unpaidTripCount >= 3 || totalAcrossBuses >= 3;

      // Keep recent 20 trips
      tracking.tripHistory.unshift(tripItem);
      if (tracking.tripHistory.length > 20) {
        tracking.tripHistory = tracking.tripHistory.slice(0, 20);
      }
      await tracking.save();
    } else {
      tracking = await BusUnpaidTracking.create({
        studentId: student._id,
        busId: bus._id,
        busNumber: bus.busNumber,
        routeName: bus.routeName || '',
        studentDetails,
        unpaidTripCount: 1,
        totalUnpaidTripsAcrossBuses: totalAcrossBuses,
        firstTravelDate: travel.timestamp || new Date(),
        lastTravelDate: travel.timestamp || new Date(),
        tripHistory: [tripItem],
        isRepeatOffender: totalAcrossBuses >= 3,
        status: 'unresolved',
        resolved: false,
      });
    }

    // Emit realtime WebSocket event to refresh the dashboard
    try {
      getIO().emit('bus-unpaid-updated', {
        tracking,
        studentId: student._id,
        busId: bus._id,
        busNumber: bus.busNumber,
        unpaidTripCount: tracking.unpaidTripCount,
        studentName: fullName,
      });
    } catch (e) {
      // Socket broadcast failure is non-fatal
    }

    return tracking;
  } catch (error) {
    console.error('Failed to update BusUnpaidTracking record:', error);
    return null;
  }
}

/**
 * Sync / backfill BusUnpaidTracking records from any existing UnpaidTravel collection entries.
 */
async function syncFromExistingUnpaid() {
  const unpaids = await UnpaidTravel.find({})
    .populate('studentId')
    .populate('busId')
    .sort({ timestamp: 1 });

  let syncedCount = 0;
  for (const item of unpaids) {
    if (!item.studentId || !item.busId) continue;
    const student = item.studentId;
    const bus = item.busId;
    const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.studentId;

    const studentDetails = {
      studentId: student.studentId,
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      fullName,
      department: student.department || '',
      batch: student.batch || '',
      phonenumber: student.phonenumber || '',
      email: student.email || '',
      photoUrl: student.photoUrl || student.faceData?.referenceImageUrl || '',
    };

    const tripItem = {
      travelRecordId: item.travelRecordId,
      unpaidTravelId: item._id,
      timestamp: item.timestamp,
      reason: item.reason || 'no_payment',
      confidenceScore: item.confidenceScore,
    };

    let tracking = await BusUnpaidTracking.findOne({
      studentId: student._id,
      busId: bus._id,
    });

    if (tracking) {
      if (!tracking.tripHistory.some((t) => t.unpaidTravelId?.toString() === item._id.toString())) {
        tracking.unpaidTripCount += 1;
        tracking.lastTravelDate = item.timestamp > tracking.lastTravelDate ? item.timestamp : tracking.lastTravelDate;
        tracking.tripHistory.unshift(tripItem);
        tracking.isRepeatOffender = tracking.unpaidTripCount >= 3;
        await tracking.save();
        syncedCount++;
      }
    } else {
      await BusUnpaidTracking.create({
        studentId: student._id,
        busId: bus._id,
        busNumber: bus.busNumber,
        routeName: bus.routeName || '',
        studentDetails,
        unpaidTripCount: 1,
        totalUnpaidTripsAcrossBuses: 1,
        firstTravelDate: item.timestamp,
        lastTravelDate: item.timestamp,
        tripHistory: [tripItem],
        isRepeatOffender: false,
        status: item.resolved ? 'resolved' : 'unresolved',
        resolved: !!item.resolved,
      });
      syncedCount++;
    }
  }
  return { syncedCount, totalRecords: await BusUnpaidTracking.countDocuments({}) };
}

module.exports = {
  recordUnpaidBoarding,
  syncFromExistingUnpaid,
};

