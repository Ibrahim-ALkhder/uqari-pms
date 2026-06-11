'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const {
    listTickets,
    getTicket,
    createTicket,
    updateTicket,
    resolveTicket,
} = require('../controllers/maintenanceController');

router.get('/', authenticate, listTickets);
router.get('/:id', authenticate, getTicket);
router.post('/', authenticate, createTicket);
router.patch('/:id', authenticate, updateTicket);
router.patch('/:id/resolve', authenticate, resolveTicket);

module.exports = router;
