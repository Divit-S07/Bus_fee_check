const crypto = require('crypto');

const verifyWebhookSignature = (req, res, next) => {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  if (!signature || !timestamp) return res.status(401).json({ message: 'Missing signature' });
  const now = Date.now();
  const reqTime = parseInt(timestamp);
  if (Math.abs(now - reqTime) > 5 * 60 * 1000) return res.status(401).json({ message: 'Timestamp expired' });
  const expected = crypto
    .createHmac('sha256', process.env.AI_SYSTEM_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ message: 'Invalid signature' });
  }
  next();
};

module.exports = { verifyWebhookSignature };