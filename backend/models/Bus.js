const mongoose = require('mongoose');

const BusSchema = new mongoose.Schema(
  {
    busNumber: { type: String, required: true, unique: true, index: true },
    registrationPlate: { type: String, required: true },
    capacity: { type: Number, required: true },
    routeName: { type: String, required: true },
    routeStops: { type: [String], default: [] },
    driverName: { type: String },
    driverPhone: { type: String },
    assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    isActive: { type: Boolean, default: true },
    gpsDeviceId: { type: String },
    lastMaintenanceDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Bus', BusSchema);