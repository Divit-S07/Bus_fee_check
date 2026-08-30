const express = require('express');
const { login, refresh, getMe } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', authenticate, getMe);

module.exports = router;