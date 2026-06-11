'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const {
    recordPayment,
    listPayments,
    getTenantCredit,
    undoPayment,
} = require('../controllers/paymentController');

router.post('/', authenticate, recordPayment);
router.get('/', authenticate, listPayments);
router.get('/credit/:tenantId', authenticate, getTenantCredit);
router.delete('/:id', authenticate, undoPayment);

module.exports = router;
