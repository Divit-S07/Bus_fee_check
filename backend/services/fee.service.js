const FeePayment = require('../models/FeePayment');

class FeeService {
  static async getCurrentFeeStatus(studentId) {
    const now = new Date();
    const payment = await FeePayment.findOne({
      studentId,
      status: 'paid',
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      isActive: true,
    }).sort({ validUntil: -1 });

    if (!payment) {
      const expired = await FeePayment.findOne({
        studentId,
        status: 'paid',
        validUntil: { $lt: now },
        isActive: true,
      }).sort({ validUntil: -1 });
      return {
        status: expired ? 'expired' : 'unpaid',
        validUntil: expired ? expired.validUntil : null,
        payment: null,
      };
    }

    return {
      status: 'paid',
      validUntil: payment.validUntil,
      payment,
    };
  }
}

module.exports = { FeeService };