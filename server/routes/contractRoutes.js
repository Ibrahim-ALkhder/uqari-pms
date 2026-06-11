// =============================================================================
// File: routes/contractRoutes.js
// Project: Uqari (عقاري) – PMS Backend
// Description: Express route definitions for /api/contracts endpoints.
// All routes require authentication via authMiddleware.
// =============================================================================

'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const {
    createContract,
    listContracts,
    getContract,
    terminateContract,
} = require('../controllers/contractController');

// ── GET /api/contracts ── List contracts (filters: ?status=, ?tenantId=, ?unitId=) ─
router.get('/', authenticate, listContracts);

// ── GET /api/contracts/:id ── Get single contract with invoices ────────────
router.get('/:id', authenticate, getContract);

// ── POST /api/contracts ── Create contract + generate first invoice ────────
router.post('/', authenticate, createContract);

// ── PATCH /api/contracts/:id/terminate ── Terminate contract, free unit ─────
router.patch('/:id/terminate', authenticate, terminateContract);

module.exports = router;
