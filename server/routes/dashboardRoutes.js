'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const {
    getSummary,
    getIncomeExpenses,
    getRecentActivity,
} = require('../controllers/dashboardController');

router.get('/summary', authenticate, getSummary);
router.get('/income-expenses', authenticate, getIncomeExpenses);
router.get('/recent-activity', authenticate, getRecentActivity);

module.exports = router;
