// =============================================================================
// File: controllers/unitController.js
// Project: Uqari (عقاري) – PMS Backend
// Description: Handlers for /api/units endpoints.
// All user-facing messages are in clear, polite Arabic.
// =============================================================================

'use strict';

const { getDatabase } = require('../database');
const { paginate, paginatedResponse } = require('../helpers/pagination');

// ────────────────────────────────────────────────────────────────────────────
// GET /api/units
// List units across all properties for the authenticated user.
// Supports optional query filters: ?property_id=X or ?status=Vacant|Occupied
// ────────────────────────────────────────────────────────────────────────────
function listUnits(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { property_id, status, page, limit } = req.query;

        let whereClause = '';
        const params = [userId];

        if (property_id) {
            const pid = parseInt(property_id, 10);
            if (!isNaN(pid)) {
                whereClause += ' AND u.property_id = ?';
                params.push(pid);
            }
        }

        if (status) {
            const validStatuses = ['Vacant', 'Occupied', 'UnderMaintenance'];
            if (validStatuses.includes(status)) {
                whereClause += ' AND u.status = ?';
                params.push(status);
            }
        }

        const orderBy = ' ORDER BY p.name ASC, u.unit_number ASC';

        const total = db.prepare(`
            SELECT COUNT(*) AS count
            FROM units u
            JOIN properties p ON u.property_id = p.id
            WHERE p.user_id = ?${whereClause}
        `).get(...params).count;

        const { data, pagination } = paginate(
            (args) => db.prepare(`
                SELECT
                    u.id,
                    u.property_id AS propertyId,
                    p.name AS propertyName,
                    u.unit_number AS unitNumber,
                    u.type,
                    u.floor,
                    u.monthly_rent AS monthlyRent,
                    u.status,
                    t.id AS tenantId,
                    t.full_name AS tenantName,
                    t.phone AS tenantPhone,
                    u.created_at AS createdAt,
                    u.updated_at AS updatedAt
                FROM units u
                JOIN properties p ON u.property_id = p.id
                LEFT JOIN tenants t ON t.id = (
                    SELECT ct.tenant_id FROM contracts ct
                    WHERE ct.unit_id = u.id AND ct.status = 'Active'
                    LIMIT 1
                )
                WHERE p.user_id = ?${whereClause}${orderBy}
                LIMIT ? OFFSET ?
            `).all(...args),
            params,
            page,
            limit,
        );

        return paginatedResponse(res, total, data, pagination);

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/units/:id
// Get a single unit by ID with full details.
// ────────────────────────────────────────────────────────────────────────────
function getUnit(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const unitId = parseInt(req.params.id, 10);

        if (isNaN(unitId)) {
            return res.status(400).json({
                success: false,
                message: 'معرف الوحدة غير صالح.',
            });
        }

        const unit = db.prepare(`
            SELECT
                u.id,
                u.property_id AS propertyId,
                p.name AS propertyName,
                u.unit_number AS unitNumber,
                u.type,
                u.floor,
                u.monthly_rent AS monthlyRent,
                u.status,
                u.created_at AS createdAt,
                u.updated_at AS updatedAt
            FROM units u
            JOIN properties p ON u.property_id = p.id
            WHERE u.id = ? AND p.user_id = ?
        `).get(unitId, userId);

        if (!unit) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على الوحدة المطلوبة.',
            });
        }

        // Get active contract (if any)
        const activeContract = db.prepare(`
            SELECT
                c.id,
                c.tenant_id AS tenantId,
                t.full_name AS tenantName,
                t.phone AS tenantPhone,
                c.start_date AS startDate,
                c.end_date AS endDate,
                c.monthly_rent AS monthlyRent,
                c.status AS contractStatus
            FROM contracts c
            JOIN tenants t ON c.tenant_id = t.id
            WHERE c.unit_id = ? AND c.status = 'Active'
            LIMIT 1
        `).get(unitId);

        // Get recent invoices for this unit
        const recentInvoices = db.prepare(`
            SELECT
                i.id,
                i.invoice_number AS invoiceNumber,
                i.billing_month AS billingMonth,
                i.billing_year AS billingYear,
                i.amount,
                i.due_date AS dueDate,
                i.status,
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paidAmount
            FROM invoices i
            WHERE i.unit_id = ?
            ORDER BY i.billing_year DESC, i.billing_month DESC
            LIMIT 12
        `).all(unitId);

        return res.status(200).json({
            success: true,
            data: {
                ...unit,
                currentContract: activeContract || null,
                invoices: recentInvoices,
            },
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/units
// Add a single unit to an existing property.
// ────────────────────────────────────────────────────────────────────────────
function createUnit(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { propertyId, unitNumber, type, floor, monthlyRent, status } = req.body;

        // ── Validate required fields ──────────────────────────────────────
        const errors = [];

        const parsedPropertyId = parseInt(propertyId, 10);
        if (!propertyId || isNaN(parsedPropertyId)) {
            errors.push({ field: 'propertyId', message: 'معرف العقار مطلوب.' });
        }

        if (!unitNumber || typeof unitNumber !== 'string' || unitNumber.trim().length < 1) {
            errors.push({ field: 'unitNumber', message: 'رقم الوحدة مطلوب.' });
        } else if (unitNumber.trim().length > 50) {
            errors.push({ field: 'unitNumber', message: 'رقم الوحدة طويل جداً. الحد الأقصى 50 حرفاً.' });
        }

        const validTypes = ['Apartment', 'Shop', 'Room', 'Villa', 'Studio'];
        if (type && !validTypes.includes(type)) {
            errors.push({ field: 'type', message: 'نوع الوحدة غير صالح. الأنواع المتاحة: شقة، محل، غرفة، فيلا، استوديو.' });
        }

        if (floor !== undefined && floor !== null && floor !== '') {
            const parsedFloor = parseInt(floor, 10);
            if (isNaN(parsedFloor) || parsedFloor < 0 || parsedFloor > 200) {
                errors.push({ field: 'floor', message: 'رقم الطابق يجب أن يكون بين 0 و 200.' });
            }
        }

        const parsedRent = monthlyRent !== undefined && monthlyRent !== '' && monthlyRent !== null ? parseFloat(monthlyRent) : 0;
        if (isNaN(parsedRent) || parsedRent < 0 || parsedRent > 999999999) {
            errors.push({ field: 'monthlyRent', message: 'الإيجار الشهري يجب أن يكون قيمة صحيحة بين 0 و 999,999,999.' });
        }

        const validStatuses = ['Vacant', 'Occupied', 'UnderMaintenance'];
        if (status && !validStatuses.includes(status)) {
            errors.push({ field: 'status', message: 'الحالة غير صالحة. الحالات المتاحة: شاغرة، مؤجرة، تحت الصيانة.' });
        }

        if (errors.length > 0) {
            return res.status(422).json({
                success: false,
                message: 'يرجى تصحيح الأخطاء التالية:',
                errors,
            });
        }

        // ── Verify property ownership and existence ───────────────────────
        const property = db.prepare('SELECT id FROM properties WHERE id = ? AND user_id = ?').get(parsedPropertyId, userId);
        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على العقار المحدد.',
            });
        }

        // ── Check for duplicate unit number within the same property ──────
        const duplicate = db.prepare('SELECT id FROM units WHERE property_id = ? AND unit_number = ?').get(parsedPropertyId, unitNumber.trim());
        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: 'رقم الوحدة موجود مسبقاً في هذا العقار. يرجى اختيار رقم آخر.',
                errors: [{ field: 'unitNumber', message: 'رقم الوحدة مكرر.' }],
            });
        }

        // ── Insert the unit ───────────────────────────────────────────────
        const result = db.prepare(`
            INSERT INTO units (property_id, unit_number, type, floor, monthly_rent, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(
            parsedPropertyId,
            unitNumber.trim(),
            type || 'Apartment',
            floor !== undefined && floor !== '' && floor !== null ? parseInt(floor, 10) : null,
            parsedRent,
            status || 'Vacant'
        );

        const unitId = result.lastInsertRowid;

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'ADD_UNIT', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, unitId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        return res.status(201).json({
            success: true,
            message: 'تم إضافة الوحدة بنجاح.',
            data: {
                id: unitId,
                propertyId: parsedPropertyId,
                unitNumber: unitNumber.trim(),
                type: type || 'Apartment',
                floor: floor !== undefined && floor !== '' && floor !== null ? parseInt(floor, 10) : null,
                monthlyRent: parsedRent,
                status: status || 'Vacant',
            },
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/units/:id
// Update unit details (partial update).
// ────────────────────────────────────────────────────────────────────────────
function updateUnit(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const unitId = parseInt(req.params.id, 10);

        if (isNaN(unitId)) {
            return res.status(400).json({ success: false, message: 'معرف الوحدة غير صالح.' });
        }

        // Verify unit ownership through property join
        const unit = db.prepare(`
            SELECT u.id, u.property_id, u.unit_number
            FROM units u
            JOIN properties p ON u.property_id = p.id
            WHERE u.id = ? AND p.user_id = ?
        `).get(unitId, userId);

        if (!unit) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على الوحدة المطلوبة.' });
        }

        const { unitNumber, type, floor, monthlyRent, status } = req.body;
        const updateFields = [];
        const updateValues = [];
        const errors = [];

        if (unitNumber !== undefined) {
            if (typeof unitNumber !== 'string' || unitNumber.trim().length < 1) {
                errors.push({ field: 'unitNumber', message: 'رقم الوحدة يجب أن يكون حرفاً واحداً على الأقل.' });
            } else if (unitNumber.trim().length > 50) {
                errors.push({ field: 'unitNumber', message: 'رقم الوحدة طويل جداً.' });
            } else {
                const dup = db.prepare('SELECT id FROM units WHERE property_id = ? AND unit_number = ? AND id != ?').get(unit.property_id, unitNumber.trim(), unitId);
                if (dup) {
                    errors.push({ field: 'unitNumber', message: 'رقم الوحدة موجود مسبقاً في هذا العقار.' });
                } else {
                    updateFields.push('unit_number = ?');
                    updateValues.push(unitNumber.trim());
                }
            }
        }

        const validTypes = ['Apartment', 'Shop', 'Room', 'Villa', 'Studio'];
        if (type !== undefined) {
            if (!validTypes.includes(type)) {
                errors.push({ field: 'type', message: 'نوع الوحدة غير صالح.' });
            } else {
                updateFields.push('type = ?');
                updateValues.push(type);
            }
        }

        if (floor !== undefined) {
            if (floor !== null && floor !== '' && (isNaN(parseInt(floor, 10)) || parseInt(floor, 10) < 0 || parseInt(floor, 10) > 200)) {
                errors.push({ field: 'floor', message: 'رقم الطابق يجب أن يكون بين 0 و 200.' });
            } else {
                updateFields.push('floor = ?');
                updateValues.push(floor !== null && floor !== '' ? parseInt(floor, 10) : null);
            }
        }

        if (monthlyRent !== undefined) {
            const parsed = parseFloat(monthlyRent);
            if (isNaN(parsed) || parsed < 0 || parsed > 999999999) {
                errors.push({ field: 'monthlyRent', message: 'الإيجار الشهري غير صالح.' });
            } else {
                updateFields.push('monthly_rent = ?');
                updateValues.push(parsed);
            }
        }

        const validStatuses = ['Vacant', 'Occupied', 'UnderMaintenance'];
        if (status !== undefined) {
            if (!validStatuses.includes(status)) {
                errors.push({ field: 'status', message: 'الحالة غير صالحة.' });
            } else {
                updateFields.push('status = ?');
                updateValues.push(status);
            }
        }

        if (errors.length > 0) {
            return res.status(422).json({ success: false, message: 'يرجى تصحيح الأخطاء التالية:', errors });
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: 'لم يتم إرسال أي بيانات للتحديث.' });
        }

        updateValues.push(unitId);
        db.prepare(`
            UPDATE units SET ${updateFields.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = ?
        `).run(...updateValues);

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'UPDATE_UNIT', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, unitId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        const updated = db.prepare(`
            SELECT id, property_id AS propertyId, unit_number AS unitNumber, type, floor, monthly_rent AS monthlyRent, status
            FROM units WHERE id = ?
        `).get(unitId);

        return res.status(200).json({
            success: true,
            message: 'تم تحديث بيانات الوحدة بنجاح.',
            data: updated,
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/units/:id
// Delete a unit. Refuses if there is an active contract on this unit.
// ────────────────────────────────────────────────────────────────────────────
function deleteUnit(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const unitId = parseInt(req.params.id, 10);

        if (isNaN(unitId)) {
            return res.status(400).json({ success: false, message: 'معرف الوحدة غير صالح.' });
        }

        const unit = db.prepare(`
            SELECT u.id, u.unit_number
            FROM units u
            JOIN properties p ON u.property_id = p.id
            WHERE u.id = ? AND p.user_id = ?
        `).get(unitId, userId);

        if (!unit) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على الوحدة المطلوبة.' });
        }

        // Check for active contract
        const activeContract = db.prepare('SELECT id FROM contracts WHERE unit_id = ? AND status = ?').get(unitId, 'Active');
        if (activeContract) {
            return res.status(409).json({
                success: false,
                message: 'لا يمكن حذف الوحدة لأنها مؤجرة بعقد نشط. يرجى إنهاء العقد أولاً.',
            });
        }

        db.prepare('DELETE FROM units WHERE id = ?').run(unitId);

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'DELETE_UNIT', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, unitId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        return res.status(200).json({
            success: true,
            message: 'تم حذف الوحدة بنجاح.',
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/units/:id/status
// Quick status toggle for a unit (e.g., Vacant -> UnderMaintenance).
// ────────────────────────────────────────────────────────────────────────────
function updateUnitStatus(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const unitId = parseInt(req.params.id, 10);

        if (isNaN(unitId)) {
            return res.status(400).json({ success: false, message: 'معرف الوحدة غير صالح.' });
        }

        const { status } = req.body;
        const validStatuses = ['Vacant', 'Occupied', 'UnderMaintenance'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(422).json({
                success: false,
                message: 'الحالة غير صالحة. الحالات المتاحة: شاغرة، مؤجرة، تحت الصيانة.',
                errors: [{ field: 'status', message: 'يرجى اختيار حالة صحيحة.' }],
            });
        }

        const unit = db.prepare(`
            SELECT u.id, u.status
            FROM units u
            JOIN properties p ON u.property_id = p.id
            WHERE u.id = ? AND p.user_id = ?
        `).get(unitId, userId);

        if (!unit) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على الوحدة.' });
        }

        // If trying to mark as Occupied, check there is no active contract
        if (status === 'Occupied') {
            const activeContract = db.prepare('SELECT id FROM contracts WHERE unit_id = ? AND status = ?').get(unitId, 'Active');
            if (!activeContract) {
                return res.status(400).json({
                    success: false,
                    message: 'لا يمكن تغيير الحالة إلى مؤجرة دون وجود عقد نشط. يرجى إنشاء عقد أولاً.',
                });
            }
        }

        // If trying to mark as Vacant, check no active contract
        if (status === 'Vacant') {
            const activeContract = db.prepare('SELECT id FROM contracts WHERE unit_id = ? AND status = ?').get(unitId, 'Active');
            if (activeContract) {
                return res.status(409).json({
                    success: false,
                    message: 'لا يمكن تغيير الحالة إلى شاغرة لأن الوحدة مؤجرة بعقد نشط. يرجى إنهاء العقد أولاً.',
                });
            }
        }

        db.prepare(`
            UPDATE units SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = ?
        `).run(status, unitId);

        const statusLabels = { Vacant: 'شاغرة', Occupied: 'مؤجرة', UnderMaintenance: 'تحت الصيانة' };

        return res.status(200).json({
            success: true,
            message: `تم تغيير حالة الوحدة إلى ${statusLabels[status]} بنجاح.`,
            data: { id: unitId, status },
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    listUnits,
    getUnit,
    createUnit,
    updateUnit,
    deleteUnit,
    updateUnitStatus,
};
