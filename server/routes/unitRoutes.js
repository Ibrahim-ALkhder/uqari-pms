// =============================================================================
// File: routes/unitRoutes.js
// Project: Uqari (عقاري) – PMS Backend
// Description: Express route definitions for /api/units endpoints.
// All routes require authentication via authMiddleware.
// =============================================================================

'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const {
    listUnits,
    getUnit,
    createUnit,
    updateUnit,
    deleteUnit,
    updateUnitStatus,
} = require('../controllers/unitController');

// ── GET /api/units ── List units with optional filters ─────────────────────
router.get('/', authenticate, listUnits);

// ── GET /api/units/:id ── Get single unit with contracts & invoices ────────
router.get('/:id', authenticate, getUnit);

// ── POST /api/units ── Create a single unit ────────────────────────────────
router.post('/', authenticate, createUnit);

// ── PUT /api/units/:id ── Update unit details ──────────────────────────────
router.put('/:id', authenticate, updateUnit);

// ── PATCH /api/units/:id/status ── Quick status toggle ─────────────────────
router.patch('/:id/status', authenticate, updateUnitStatus);

// ── DELETE /api/units/:id ── Delete a unit (no active contract allowed) ────
router.delete('/:id', authenticate, deleteUnit);

module.exports = router;
