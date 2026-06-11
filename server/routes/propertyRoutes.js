// =============================================================================
// File: routes/propertyRoutes.js
// Project: Uqari (عقاري) – PMS Backend
// Description: Express route definitions for /api/properties endpoints.
// All routes require authentication via authMiddleware.
// =============================================================================

'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const {
    listProperties,
    getProperty,
    createProperty,
    updateProperty,
    deleteProperty,
} = require('../controllers/propertyController');

// ── GET /api/properties ── List all properties with unit counts ────────────
router.get('/', authenticate, listProperties);

// ── GET /api/properties/:id ── Get single property with units ──────────────
router.get('/:id', authenticate, getProperty);

// ── POST /api/properties ── Create property with auto-generated units ──────
router.post('/', authenticate, createProperty);

// ── PUT /api/properties/:id ── Update property details ─────────────────────
router.put('/:id', authenticate, updateProperty);

// ── DELETE /api/properties/:id ── Delete property (requires confirmation) ──
router.delete('/:id', authenticate, deleteProperty);

module.exports = router;
