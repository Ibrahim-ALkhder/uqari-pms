// =============================================================================
// File: controllers/propertyController.js
// Project: Uqari (عقاري) – PMS Backend
// Description: Handlers for /api/properties endpoints.
// All user-facing messages are in clear, polite Arabic.
// =============================================================================

'use strict';

const { getDatabase } = require('../database');
const { paginate, paginatedResponse } = require('../helpers/pagination');

// ────────────────────────────────────────────────────────────────────────────
// GET /api/properties
// List all properties for the authenticated user with total unit counts.
// ────────────────────────────────────────────────────────────────────────────
function listProperties(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { page, limit } = req.query;

        const total = db.prepare(
            'SELECT COUNT(*) AS count FROM properties WHERE user_id = ?'
        ).get(userId).count;

        const { data, pagination } = paginate(
            (args) => db.prepare(`
                SELECT
                    p.id,
                    p.name,
                    p.city,
                    p.notes,
                    COUNT(u.id) AS unitCount,
                    SUM(CASE WHEN u.status = 'Occupied' THEN 1 ELSE 0 END) AS occupiedCount,
                    p.created_at AS createdAt,
                    p.updated_at AS updatedAt
                FROM properties p
                LEFT JOIN units u ON u.property_id = p.id
                WHERE p.user_id = ?
                GROUP BY p.id
                ORDER BY p.created_at DESC
                LIMIT ? OFFSET ?
            `).all(...args),
            [userId],
            page,
            limit,
        );

        return paginatedResponse(res, total, data, pagination);

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/properties/:id
// Get a single property with its full unit list.
// ────────────────────────────────────────────────────────────────────────────
function getProperty(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const propertyId = parseInt(req.params.id, 10);

        if (isNaN(propertyId)) {
            return res.status(400).json({
                success: false,
                message: 'معرف العقار غير صالح. يرجى إدخال رقم صحيح.',
            });
        }

        const property = db.prepare(`
            SELECT
                p.id,
                p.name,
                p.city,
                p.notes,
                p.created_at AS createdAt,
                p.updated_at AS updatedAt
            FROM properties p
            WHERE p.id = ? AND p.user_id = ?
        `).get(propertyId, userId);

        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على العقار المطلوب.',
            });
        }

        const units = db.prepare(`
            SELECT
                u.id,
                u.unit_number AS unitNumber,
                u.type,
                u.floor,
                u.monthly_rent AS monthlyRent,
                u.status,
                t.full_name AS tenantName,
                u.created_at AS createdAt,
                u.updated_at AS updatedAt
            FROM units u
            LEFT JOIN tenants t ON t.id = (
                SELECT ct.tenant_id FROM contracts ct
                WHERE ct.unit_id = u.id AND ct.status = 'Active'
                LIMIT 1
            )
            WHERE u.property_id = ?
            ORDER BY u.unit_number ASC
        `).all(propertyId);

        return res.status(200).json({
            success: true,
            data: {
                ...property,
                units,
            },
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/properties
// Create a new property with auto-generated units.
// ────────────────────────────────────────────────────────────────────────────
function createProperty(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { name, city, unitCount, notes } = req.body;

        // ── Validate required fields ──────────────────────────────────────
        const errors = [];

        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            errors.push({ field: 'name', message: 'اسم العقار مطلوب ويجب أن يكون حرفين على الأقل.' });
        }
        if (name && name.trim().length > 100) {
            errors.push({ field: 'name', message: 'اسم العقار طويل جداً. الحد الأقصى 100 حرف.' });
        }

        if (!city || typeof city !== 'string' || city.trim().length < 2) {
            errors.push({ field: 'city', message: 'المدينة مطلوبة ويجب أن تكون حرفين على الأقل.' });
        }
        if (city && city.trim().length > 100) {
            errors.push({ field: 'city', message: 'اسم المدينة طويل جداً. الحد الأقصى 100 حرف.' });
        }

        const parsedUnitCount = parseInt(unitCount, 10);
        if (!unitCount || isNaN(parsedUnitCount) || parsedUnitCount < 1 || parsedUnitCount > 100) {
            errors.push({ field: 'unitCount', message: 'عدد الوحدات يجب أن يكون بين 1 و 100.' });
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

        // ── Check for duplicate name ──────────────────────────────────────
        const existing = db.prepare('SELECT id FROM properties WHERE user_id = ? AND name = ?').get(userId, name.trim());
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'يوجد عقار بنفس الاسم بالفعل. يرجى اختيار اسم آخر.',
                errors: [{ field: 'name', message: 'اسم العقار مكرر.' }],
            });
        }

        // ── Insert property and generate units in a transaction ───────────
        const insertProperty = db.prepare(`
            INSERT INTO properties (user_id, name, city, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `);

        const insertUnit = db.prepare(`
            INSERT INTO units (property_id, unit_number, type, monthly_rent, status, created_at, updated_at)
            VALUES (?, ?, 'Apartment', 0, 'Vacant',
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `);

        const transaction = db.transaction(() => {
            const propertyResult = insertProperty.run(userId, name.trim(), city.trim(), notes || null);
            const propertyId = propertyResult.lastInsertRowid;

            const units = [];
            for (let i = 1; i <= parsedUnitCount; i++) {
                const unitResult = insertUnit.run(propertyId, `وحدة ${i}`);
                units.push({ id: unitResult.lastInsertRowid, unitNumber: `وحدة ${i}` });
            }

            return { propertyId, units };
        });

        const { propertyId, units } = transaction();

        // ── Log audit ─────────────────────────────────────────────────────
        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'ADD_PROPERTY', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, propertyId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        return res.status(201).json({
            success: true,
            message: 'تم إضافة العقار بنجاح مع جميع وحداته.',
            data: {
                id: propertyId,
                name: name.trim(),
                city: city.trim(),
                unitCount: parsedUnitCount,
                units,
            },
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/properties/:id
// Update an existing property's details.
// ────────────────────────────────────────────────────────────────────────────
function updateProperty(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const propertyId = parseInt(req.params.id, 10);

        if (isNaN(propertyId)) {
            return res.status(400).json({
                success: false,
                message: 'معرف العقار غير صالح.',
            });
        }

        const property = db.prepare('SELECT id FROM properties WHERE id = ? AND user_id = ?').get(propertyId, userId);
        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على العقار المطلوب.',
            });
        }

        const { name, city, notes } = req.body;

        const errors = [];
        if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2)) {
            errors.push({ field: 'name', message: 'اسم العقار يجب أن يكون حرفين على الأقل.' });
        }
        if (name && name.trim().length > 100) {
            errors.push({ field: 'name', message: 'اسم العقار طويل جداً.' });
        }
        if (city !== undefined && (typeof city !== 'string' || city.trim().length < 2)) {
            errors.push({ field: 'city', message: 'المدينة يجب أن تكون حرفين على الأقل.' });
        }
        if (notes !== undefined && typeof notes === 'string' && notes.length > 500) {
            errors.push({ field: 'notes', message: 'الملاحظات طويلة جداً.' });
        }
        if (errors.length > 0) {
            return res.status(422).json({ success: false, message: 'يرجى تصحيح الأخطاء التالية:', errors });
        }

        const updateFields = [];
        const updateValues = [];

        if (name !== undefined) { updateFields.push('name = ?'); updateValues.push(name.trim()); }
        if (city !== undefined) { updateFields.push('city = ?'); updateValues.push(city.trim()); }
        if (notes !== undefined) { updateFields.push('notes = ?'); updateValues.push(notes || null); }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'لم يتم إرسال أي بيانات للتحديث.',
            });
        }

        updateValues.push(propertyId, userId);
        db.prepare(`
            UPDATE properties SET ${updateFields.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = ? AND user_id = ?
        `).run(...updateValues);

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'UPDATE_PROPERTY', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, propertyId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        const updated = db.prepare('SELECT id, name, city, notes FROM properties WHERE id = ?').get(propertyId);

        return res.status(200).json({
            success: true,
            message: 'تم تحديث بيانات العقار بنجاح.',
            data: updated,
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/properties/:id
// Destructive delete. Requires typed confirmation word 'محو' or 'حذف'
// in the request body. Refuses if any active contracts exist on the property.
// ────────────────────────────────────────────────────────────────────────────
function deleteProperty(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const propertyId = parseInt(req.params.id, 10);

        if (isNaN(propertyId)) {
            return res.status(400).json({
                success: false,
                message: 'معرف العقار غير صالح.',
            });
        }

        // ── Verify typed confirmation word ────────────────────────────────
        const { confirm } = req.body;
        const allowedWords = ['محو', 'حذف'];
        if (!confirm || typeof confirm !== 'string' || !allowedWords.includes(confirm.trim())) {
            return res.status(400).json({
                success: false,
                message: 'يرجى كتابة كلمة "محو" أو "حذف" في حقل التأكيد لحذف العقار. هذه العملية لا يمكن التراجع عنها.',
                errors: [{ field: 'confirm', message: 'يجب كتابة "محو" أو "حذف" للتأكيد.' }],
            });
        }

        // ── Verify ownership ──────────────────────────────────────────────
        const property = db.prepare('SELECT id, name FROM properties WHERE id = ? AND user_id = ?').get(propertyId, userId);
        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على العقار المطلوب.',
            });
        }

        // ── Check for active contracts on units within this property ──────
        const activeContract = db.prepare(`
            SELECT c.id
            FROM contracts c
            JOIN units u ON c.unit_id = u.id
            WHERE u.property_id = ? AND c.status = 'Active'
            LIMIT 1
        `).get(propertyId);

        if (activeContract) {
            return res.status(409).json({
                success: false,
                message: 'عذراً، لا يمكن حذف العقار لأنه يحتوي على وحدات مؤجرة بعقود نشطة. يرجى إنهاء العقود أولاً ثم المحاولة مرة أخرى.',
            });
        }

        // ── Check for unpaid invoices on any unit in this property ───────
        const unpaidInvoice = db.prepare(`
            SELECT i.id
            FROM invoices i
            JOIN units u ON i.unit_id = u.id
            WHERE u.property_id = ? AND i.status IN ('Unpaid', 'Overdue', 'Partial')
            LIMIT 1
        `).get(propertyId);

        if (unpaidInvoice) {
            return res.status(409).json({
                success: false,
                message: 'عذراً، لا يمكن حذف العقار لوجود فواتير غير مدفوعة مرتبطة به. يرجى تحصيل الفواتير أولاً.',
            });
        }

        // ── Proceed with deletion ─────────────────────────────────────────
        // CASCADE will remove units, then invoices, payments, tickets, etc.
        db.prepare('DELETE FROM properties WHERE id = ? AND user_id = ?').run(propertyId, userId);

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, details, created_at)
            VALUES (?, 'DELETE_PROPERTY', ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, propertyId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown', JSON.stringify({ name: property.name }));

        return res.status(200).json({
            success: true,
            message: 'تم حذف العقار وجميع البيانات المرتبطة به نهائياً.',
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    listProperties,
    getProperty,
    createProperty,
    updateProperty,
    deleteProperty,
};
