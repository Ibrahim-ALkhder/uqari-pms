// =============================================================================
// File: routes/tenantRoutes.js
// Project: Uqari (عقاري) – PMS Backend
// Description: Express route definitions for /api/tenants endpoints.
// All routes require authentication via authMiddleware.
// =============================================================================

'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const {
    listTenants,
    getTenant,
    createTenant,
    updateTenant,
    deleteTenant,
} = require('../controllers/tenantController');

// ── GET /api/tenants ── List tenants (filters: ?status=active|former, ?search=) ─
router.get('/', authenticate, listTenants);

// ── GET /api/tenants/:id ── Get single tenant with contracts & payments ────
router.get('/:id', authenticate, getTenant);

// ── POST /api/tenants ── Register a new tenant ─────────────────────────────
router.post('/', authenticate, createTenant);

// ── PUT /api/tenants/:id ── Update tenant details ──────────────────────────
router.put('/:id', authenticate, updateTenant);

// ── DELETE /api/tenants/:id ── Soft-delete (mark as former) ────────────────
router.delete('/:id', authenticate, deleteTenant);

module.exports = router;
