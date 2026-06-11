'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const {
    listInvoices,
    getInvoice,
    getOverdueInvoices,
} = require('../controllers/invoiceController');

router.get('/', authenticate, listInvoices);
router.get('/overdue', authenticate, getOverdueInvoices);
router.get('/:id', authenticate, getInvoice);

module.exports = router;
