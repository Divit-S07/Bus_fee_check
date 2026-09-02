// Payment feature removed
class FeeService {
  static async getCurrentFeeStatus() {
    return { status: 'active', validUntil: null, payment: null };
  }
}
module.exports = { FeeService };