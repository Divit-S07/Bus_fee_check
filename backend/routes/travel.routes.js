const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getAllTravels } = require('../controllers/travel.controller');

const router = express.Router();
router.use(authenticate);
router.get('/', getAllTravels);
module.exports = router;