'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const { syncData } = require('../controllers/syncController');

router.post('/', authenticate, syncData);

module.exports = router;
