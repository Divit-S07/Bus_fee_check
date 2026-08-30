const express = require('express');
const { handleRecognition } = require('../controllers/webhook.controller');
const { verifyWebhookSignature } = require('../middleware/webhookSignature');

const router = express.Router();
router.post('/recognition', verifyWebhookSignature, handleRecognition);
module.exports = router;