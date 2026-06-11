// =============================================================================
// File: controllers/tenantController.js
// Project: Uqari (عقاري) – PMS Backend
// Description: Handlers for /api/tenants endpoints.
// All user-facing messages are in clear, polite Arabic.
// =============================================================================

'use strict';

const { getDatabase } = require('../database');
const { paginate, paginatedResponse } = require('../helpers/pagination');

// ────────────────────────────────────────────────────────────────────────────
// GET /api/tenants
// List tenants. Supports status filter: ?status=active or ?status=former.
// Default: active only (is_former = 0).
// ────────────────────────────────────────────────────────────────────────────
function listTenants(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { status, search, page, limit } = req.query;

        let whereClause = '';
        const params = [userId];

        if (status === 'former') {
            whereClause += ' AND t.is_former = 1';
        } else {
            whereClause += ' AND t.is_former = 0';
        }

        if (search && typeof search === 'string' && search.trim().length >= 2) {
            whereClause += ' AND t.full_name LIKE ?';
            params.push(`%${search.trim()}%`);
        }

        const total = db.prepare(
            `SELECT COUNT(*) AS count FROM tenants t WHERE t.user_id = ?${whereClause}`
        ).get(...params).count;

        const { data, pagination } = paginate(
            (args) => db.prepare(`
                SELECT
                    t.id,
                    t.full_name AS fullName,
                    t.phone,
                    t.secondary_phone AS secondaryPhone,
                    t.national_id AS nationalId,
                    t.notes,
                    t.is_former AS isFormer,
                    u.unit_number AS unitNumber,
                    p.name AS propertyName,
                    c.id AS contractId,
                    c.status AS contractStatus,
                    t.created_at AS createdAt,
                    t.updated_at AS updatedAt
                FROM tenants t
                LEFT JOIN contracts c ON c.tenant_id = t.id AND c.status = 'Active'
                LEFT JOIN units u ON c.unit_id = u.id
                LEFT JOIN properties p ON u.property_id = p.id
                WHERE t.user_id = ?${whereClause}
                ORDER BY t.full_name ASC
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
// GET /api/tenants/:id
// Get a single tenant with full contract and payment history.
// ────────────────────────────────────────────────────────────────────────────
function getTenant(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const tenantId = parseInt(req.params.id, 10);

        if (isNaN(tenantId)) {
            return res.status(400).json({
                success: false,
                message: 'معرف المستأجر غير صالح.',
            });
        }

        const tenant = db.prepare(`
            SELECT
                t.id,
                t.full_name AS fullName,
                t.phone,
                t.secondary_phone AS secondaryPhone,
                t.national_id AS nationalId,
                t.notes,
                t.is_former AS isFormer,
                t.created_at AS createdAt,
                t.updated_at AS updatedAt
            FROM tenants t
            WHERE t.id = ? AND t.user_id = ?
        `).get(tenantId, userId);

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على المستأجر.',
            });
        }

        const contracts = db.prepare(`
            SELECT
                c.id,
                c.unit_id AS unitId,
                u.unit_number AS unitNumber,
                p.name AS propertyName,
                c.start_date AS startDate,
                c.end_date AS endDate,
                c.monthly_rent AS monthlyRent,
                c.status
            FROM contracts c
            JOIN units u ON c.unit_id = u.id
            JOIN properties p ON u.property_id = p.id
            WHERE c.tenant_id = ?
            ORDER BY c.created_at DESC
        `).all(tenantId);

        const payments = db.prepare(`
            SELECT
                py.id,
                py.amount,
                py.payment_date AS paymentDate,
                py.payment_method AS paymentMethod,
                py.notes,
                i.invoice_number AS invoiceNumber,
                i.billing_month AS billingMonth,
                i.billing_year AS billingYear
            FROM payments py
            JOIN invoices i ON py.invoice_id = i.id
            WHERE i.tenant_id = ?
            ORDER BY py.created_at DESC
            LIMIT 20
        `).all(tenantId);

        return res.status(200).json({
            success: true,
            data: {
                ...tenant,
                contracts,
                recentPayments: payments,
            },
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/tenants
// Register a new tenant manually. Does NOT create a contract; that is done
// via POST /api/contracts. This simply records the tenant's personal details.
// ────────────────────────────────────────────────────────────────────────────
function createTenant(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { fullName, phone, secondaryPhone, nationalId, notes } = req.body;

        // ── Validate ──────────────────────────────────────────────────────
        const errors = [];

        if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
            errors.push({ field: 'fullName', message: 'الاسم الكامل مطلوب ويجب أن يكون حرفين على الأقل.' });
        } else if (fullName.trim().length > 100) {
            errors.push({ field: 'fullName', message: 'الاسم طويل جداً. الحد الأقصى 100 حرف.' });
        }

        if (!phone || typeof phone !== 'string') {
            errors.push({ field: 'phone', message: 'رقم الجوال مطلوب.' });
        } else {
            const cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
            if (cleaned.length < 7 || cleaned.length > 20) {
                errors.push({ field: 'phone', message: 'رقم الجوال غير صالح. يجب أن يكون بين 7 و 20 رقم.' });
            }
        }

        if (secondaryPhone && typeof secondaryPhone === 'string') {
            const cleaned = secondaryPhone.trim().replace(/[\s\-\(\)]/g, '');
            if (cleaned.length > 0 && (cleaned.length < 7 || cleaned.length > 20)) {
                errors.push({ field: 'secondaryPhone', message: 'رقم الجوال الثاني غير صالح.' });
            }
        }

        if (nationalId && typeof nationalId === 'string' && nationalId.trim().length > 0) {
            if (nationalId.trim().length < 5 || nationalId.trim().length > 20) {
                errors.push({ field: 'nationalId', message: 'رقم الهوية يجب أن يكون بين 5 و 20 حرفاً.' });
            }
        }

        if (notes && typeof notes === 'string' && notes.length > 500) {
            errors.push({ field: 'notes', message: 'الملاحظات طويلة جداً. الحد الأقصى 500 حرف.' });
        }

        if (errors.length > 0) {
            return res.status(422).json({
                success: false,
                message: 'يرجى تصحيح الأخطاء التالية:',
                errors,
            });
        }

        // ── Check duplicate phone (non-blocking warning if same user) ─────
        const existingPhone = db.prepare('SELECT id, full_name FROM tenants WHERE user_id = ? AND phone = ? AND is_former = 0').get(userId, phone.trim());
        if (existingPhone) {
            return res.status(409).json({
                success: false,
                message: `يوجد مستأجر نشط بنفس رقم الجوال: ${existingPhone.full_name}. يرجى التحقق من البيانات.`,
                errors: [{ field: 'phone', message: 'رقم الجوال موجود مسبقاً.' }],
            });
        }

        // ── Insert tenant ─────────────────────────────────────────────────
        const result = db.prepare(`
            INSERT INTO tenants (user_id, full_name, phone, secondary_phone, national_id, notes, is_former, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(
            userId,
            fullName.trim(),
            phone.trim(),
            secondaryPhone && secondaryPhone.trim() ? secondaryPhone.trim() : null,
            nationalId && nationalId.trim() ? nationalId.trim() : null,
            notes && notes.trim() ? notes.trim() : null
        );

        const tenantId = result.lastInsertRowid;

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'ADD_TENANT', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, tenantId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        return res.status(201).json({
            success: true,
            message: 'تم تسجيل المستأجر بنجاح. يمكنك الآن إنشاء عقد له.',
            data: {
                id: tenantId,
                fullName: fullName.trim(),
                phone: phone.trim(),
                secondaryPhone: secondaryPhone && secondaryPhone.trim() ? secondaryPhone.trim() : null,
                nationalId: nationalId && nationalId.trim() ? nationalId.trim() : null,
                notes: notes && notes.trim() ? notes.trim() : null,
            },
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/tenants/:id
// Update tenant personal details.
// ────────────────────────────────────────────────────────────────────────────
function updateTenant(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const tenantId = parseInt(req.params.id, 10);

        if (isNaN(tenantId)) {
            return res.status(400).json({ success: false, message: 'معرف المستأجر غير صالح.' });
        }

        const tenant = db.prepare('SELECT id FROM tenants WHERE id = ? AND user_id = ?').get(tenantId, userId);
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على المستأجر.' });
        }

        const { fullName, phone, secondaryPhone, nationalId, notes } = req.body;
        const updateFields = [];
        const updateValues = [];
        const errors = [];

        if (fullName !== undefined) {
            if (typeof fullName !== 'string' || fullName.trim().length < 2) {
                errors.push({ field: 'fullName', message: 'الاسم يجب أن يكون حرفين على الأقل.' });
            } else {
                updateFields.push('full_name = ?');
                updateValues.push(fullName.trim());
            }
        }

        if (phone !== undefined) {
            const cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
            if (cleaned.length < 7 || cleaned.length > 20) {
                errors.push({ field: 'phone', message: 'رقم الجوال غير صالح.' });
            } else {
                updateFields.push('phone = ?');
                updateValues.push(phone.trim());
            }
        }

        if (secondaryPhone !== undefined) {
            if (secondaryPhone.trim().length > 0 && (secondaryPhone.trim().replace(/[\s\-\(\)]/g, '').length < 7 || secondaryPhone.trim().replace(/[\s\-\(\)]/g, '').length > 20)) {
                errors.push({ field: 'secondaryPhone', message: 'رقم الجوال الثاني غير صالح.' });
            } else {
                updateFields.push('secondary_phone = ?');
                updateValues.push(secondaryPhone.trim() || null);
            }
        }

        if (nationalId !== undefined) {
            if (nationalId.trim().length > 0 && (nationalId.trim().length < 5 || nationalId.trim().length > 20)) {
                errors.push({ field: 'nationalId', message: 'رقم الهوية غير صالح.' });
            } else {
                updateFields.push('national_id = ?');
                updateValues.push(nationalId.trim() || null);
            }
        }

        if (notes !== undefined) {
            if (notes.length > 500) {
                errors.push({ field: 'notes', message: 'الملاحظات طويلة جداً.' });
            } else {
                updateFields.push('notes = ?');
                updateValues.push(notes.trim() || null);
            }
        }

        if (errors.length > 0) {
            return res.status(422).json({ success: false, message: 'يرجى تصحيح الأخطاء التالية:', errors });
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: 'لم يتم إرسال أي بيانات للتحديث.' });
        }

        updateValues.push(tenantId, userId);
        db.prepare(`
            UPDATE tenants SET ${updateFields.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = ? AND user_id = ?
        `).run(...updateValues);

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'UPDATE_TENANT', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, tenantId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        const updated = db.prepare(`
            SELECT id, full_name AS fullName, phone, secondary_phone AS secondaryPhone,
                   national_id AS nationalId, notes, is_former AS isFormer
            FROM tenants WHERE id = ?
        `).get(tenantId);

        return res.status(200).json({
            success: true,
            message: 'تم تحديث بيانات المستأجر بنجاح.',
            data: updated,
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/tenants/:id
// Soft-delete a tenant by marking is_former = 1.
// Refuses if tenant has an active contract.
// ────────────────────────────────────────────────────────────────────────────
function deleteTenant(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const tenantId = parseInt(req.params.id, 10);

        if (isNaN(tenantId)) {
            return res.status(400).json({ success: false, message: 'معرف المستأجر غير صالح.' });
        }

        const tenant = db.prepare('SELECT id, full_name FROM tenants WHERE id = ? AND user_id = ?').get(tenantId, userId);
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على المستأجر.' });
        }

        const activeContract = db.prepare('SELECT id FROM contracts WHERE tenant_id = ? AND status = ?').get(tenantId, 'Active');
        if (activeContract) {
            return res.status(409).json({
                success: false,
                message: 'لا يمكن حذف المستأجر لأنه لديه عقد نشط. يرجى إنهاء العقد أولاً.',
            });
        }

        // Soft delete
        db.prepare(`
            UPDATE tenants SET is_former = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = ? AND user_id = ?
        `).run(tenantId, userId);

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, details, created_at)
            VALUES (?, 'DELETE_TENANT', ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, tenantId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown', JSON.stringify({ name: tenant.full_name }));

        return res.status(200).json({
            success: true,
            message: 'تم نقل المستأجر إلى قائمة المستأجرين السابقين.',
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    listTenants,
    getTenant,
    createTenant,
    updateTenant,
    deleteTenant,
};
