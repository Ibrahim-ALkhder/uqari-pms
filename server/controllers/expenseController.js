'use strict';

const path = require('path');
const { getDatabase } = require('../database');
const { paginate, paginatedResponse } = require('../helpers/pagination');

function listExpenses(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { property_id, type, from_date, to_date, group_by, page, limit } = req.query;

        let selectColumns = `
            e.id,
            e.property_id AS propertyId,
            COALESCE(p.name, '(بدون عقار)') AS propertyName,
            e.unit_id AS unitId,
            u.unit_number AS unitNumber,
            e.type,
            e.amount,
            e.date,
            e.description,
            e.receipt_image_path AS receiptImagePath,
            e.created_at AS createdAt,
            e.updated_at AS updatedAt
        `;

        let groupByClause = '';
        let orderByClause = ' ORDER BY e.date DESC, e.created_at DESC';

        if (group_by === 'month') {
            selectColumns = `
                strftime('%Y-%m', e.date) AS period,
                COUNT(*) AS expenseCount,
                SUM(e.amount) AS totalAmount,
                GROUP_CONCAT(DISTINCT e.type) AS types
            `;
            groupByClause = ' GROUP BY strftime(\'%Y-%m\', e.date)';
            orderByClause = ' ORDER BY period DESC';
        } else if (group_by === 'type') {
            selectColumns = `
                e.type,
                COUNT(*) AS expenseCount,
                SUM(e.amount) AS totalAmount
            `;
            groupByClause = ' GROUP BY e.type';
            orderByClause = ' ORDER BY totalAmount DESC';
        } else if (group_by === 'property') {
            selectColumns = `
                e.property_id AS propertyId,
                COALESCE(p.name, '(بدون عقار)') AS propertyName,
                COUNT(*) AS expenseCount,
                SUM(e.amount) AS totalAmount
            `;
            groupByClause = ' GROUP BY e.property_id';
            orderByClause = ' ORDER BY totalAmount DESC';
        }

        let query = `
            SELECT ${selectColumns}
            FROM expenses e
            LEFT JOIN properties p ON e.property_id = p.id
            LEFT JOIN units u ON e.unit_id = u.id
            WHERE e.user_id = ?
        `;

        const params = [userId];

        if (property_id) {
            const parsed = parseInt(property_id, 10);
            if (!isNaN(parsed)) { query += ' AND e.property_id = ?'; params.push(parsed); }
        }

        const validTypes = ['Maintenance', 'Utilities', 'Repairs', 'Cleaning', 'MunicipalityFees', 'Insurance', 'Other'];
        if (type && validTypes.includes(type)) {
            query += ' AND e.type = ?';
            params.push(type);
        }

        if (from_date) {
            query += ' AND e.date >= ?';
            params.push(from_date);
        }

        if (to_date) {
            query += ' AND e.date <= ?';
            params.push(to_date);
        }

        query += groupByClause + orderByClause;

        // Grouped queries don't use pagination
        if (group_by) {
            const expenses = db.prepare(query).all(...params);
            return res.status(200).json({ success: true, data: expenses });
        }

        const total = db.prepare(`SELECT COUNT(*) AS count FROM (${query})`).get(...params).count;

        const { data, pagination } = paginate(
            (args) => db.prepare(query + ' LIMIT ? OFFSET ?').all(...args),
            params,
            page,
            limit,
        );

        return paginatedResponse(res, total, data, pagination);

    } catch (error) {
        next(error);
    }
}

function getExpense(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const expenseId = parseInt(req.params.id, 10);

        if (isNaN(expenseId)) {
            return res.status(400).json({ success: false, message: 'معرف المصروف غير صالح.' });
        }

        const expense = db.prepare(`
            SELECT
                e.id,
                e.property_id AS propertyId,
                COALESCE(p.name, '(بدون عقار)') AS propertyName,
                e.unit_id AS unitId,
                u.unit_number AS unitNumber,
                e.type,
                e.amount,
                e.date,
                e.description,
                e.receipt_image_path AS receiptImagePath,
                e.created_at AS createdAt,
                e.updated_at AS updatedAt
            FROM expenses e
            LEFT JOIN properties p ON e.property_id = p.id
            LEFT JOIN units u ON e.unit_id = u.id
            WHERE e.id = ? AND e.user_id = ?
        `).get(expenseId, userId);

        if (!expense) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على المصروف.' });
        }

        return res.status(200).json({ success: true, data: expense });

    } catch (error) {
        next(error);
    }
}

function createExpense(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { propertyId, unitId, type, amount, date, description } = req.body;

        const errors = [];

        const validTypes = ['Maintenance', 'Utilities', 'Repairs', 'Cleaning', 'MunicipalityFees', 'Insurance', 'Other'];
        if (!type || !validTypes.includes(type)) {
            errors.push({ field: 'type', message: 'نوع المصروف غير صالح. الأنواع المتاحة: صيانة، فواتير، إصلاحات، تنظيف، رسوم بلدية، تأمين، أخرى.' });
        }

        const parsedAmount = parseFloat(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            errors.push({ field: 'amount', message: 'المبلغ يجب أن يكون أكبر من صفر.' });
        }

        if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            errors.push({ field: 'date', message: 'التاريخ مطلوب بصيغة YYYY-MM-DD.' });
        }

        if (!description || typeof description !== 'string' || description.trim().length < 3) {
            errors.push({ field: 'description', message: 'وصف المصروف مطلوب ويجب أن يكون 3 أحرف على الأقل.' });
        } else if (description.length > 500) {
            errors.push({ field: 'description', message: 'الوصف طويل جداً. الحد الأقصى 500 حرف.' });
        }

        if (propertyId) {
            const parsed = parseInt(propertyId, 10);
            if (isNaN(parsed)) {
                errors.push({ field: 'propertyId', message: 'معرف العقار غير صالح.' });
            } else {
                const prop = db.prepare('SELECT id, name FROM properties WHERE id = ? AND user_id = ?').get(parsed, userId);
                if (!prop) {
                    errors.push({ field: 'propertyId', message: 'العقار المحدد غير موجود.' });
                }
            }
        }

        if (unitId) {
            const parsed = parseInt(unitId, 10);
            if (isNaN(parsed)) {
                errors.push({ field: 'unitId', message: 'معرف الوحدة غير صالح.' });
            } else {
                const unit = db.prepare(`
                    SELECT u.id FROM units u
                    JOIN properties p ON u.property_id = p.id
                    WHERE u.id = ? AND p.user_id = ?
                `).get(parsed, userId);
                if (!unit) {
                    errors.push({ field: 'unitId', message: 'الوحدة المحددة غير موجودة.' });
                }
            }
        }

        if (errors.length > 0) {
            return res.status(422).json({ success: false, message: 'يرجى تصحيح الأخطاء التالية:', errors });
        }

        let receiptImagePath = null;
        if (req.file) {
            receiptImagePath = path.join('uploads', 'receipts', req.file.filename);
        }

        const result = db.prepare(`
            INSERT INTO expenses (user_id, property_id, unit_id, type, amount, date, description, receipt_image_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(
            userId,
            propertyId ? parseInt(propertyId, 10) : null,
            unitId ? parseInt(unitId, 10) : null,
            type,
            parsedAmount,
            date,
            description.trim(),
            receiptImagePath
        );

        const expenseId = result.lastInsertRowid;

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, details, created_at)
            VALUES (?, 'ADD_EXPENSE', ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, expenseId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown',
               JSON.stringify({ type, amount: parsedAmount, date, propertyId }));

        const typeLabels = {
            Maintenance: 'صيانة', Utilities: 'فواتير', Repairs: 'إصلاحات',
            Cleaning: 'تنظيف', MunicipalityFees: 'رسوم بلدية', Insurance: 'تأمين', Other: 'أخرى',
        };

        return res.status(201).json({
            success: true,
            message: `✓ تم إضافة مصروف ${typeLabels[type] || type} بقيمة ${parsedAmount.toFixed(2)} ريال بنجاح.`,
            data: {
                id: expenseId,
                type,
                amount: parsedAmount,
                date,
                description: description.trim(),
                propertyId: propertyId ? parseInt(propertyId, 10) : null,
            },
        });

    } catch (error) {
        next(error);
    }
}

function updateExpense(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const expenseId = parseInt(req.params.id, 10);

        if (isNaN(expenseId)) {
            return res.status(400).json({ success: false, message: 'معرف المصروف غير صالح.' });
        }

        const existing = db.prepare('SELECT id FROM expenses WHERE id = ? AND user_id = ?').get(expenseId, userId);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على المصروف.' });
        }

        const { type, amount, date, description, propertyId, unitId } = req.body;
        const updateFields = [];
        const updateValues = [];
        const errors = [];

        const validTypes = ['Maintenance', 'Utilities', 'Repairs', 'Cleaning', 'MunicipalityFees', 'Insurance', 'Other'];
        if (type !== undefined) {
            if (!validTypes.includes(type)) { errors.push({ field: 'type', message: 'نوع المصروف غير صالح.' }); }
            else { updateFields.push('type = ?'); updateValues.push(type); }
        }

        if (amount !== undefined) {
            const parsed = parseFloat(amount);
            if (isNaN(parsed) || parsed <= 0) { errors.push({ field: 'amount', message: 'المبلغ يجب أن يكون أكبر من صفر.' }); }
            else { updateFields.push('amount = ?'); updateValues.push(parsed); }
        }

        if (date !== undefined) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push({ field: 'date', message: 'صيغة التاريخ غير صحيحة.' }); }
            else { updateFields.push('date = ?'); updateValues.push(date); }
        }

        if (description !== undefined) {
            if (description.trim().length < 3) { errors.push({ field: 'description', message: 'الوصف يجب أن يكون 3 أحرف على الأقل.' }); }
            else { updateFields.push('description = ?'); updateValues.push(description.trim()); }
        }

        if (propertyId !== undefined) {
            updateFields.push('property_id = ?');
            updateValues.push(propertyId ? parseInt(propertyId, 10) : null);
        }

        if (unitId !== undefined) {
            updateFields.push('unit_id = ?');
            updateValues.push(unitId ? parseInt(unitId, 10) : null);
        }

        if (errors.length > 0) {
            return res.status(422).json({ success: false, message: 'يرجى تصحيح الأخطاء التالية:', errors });
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: 'لم يتم إرسال أي بيانات للتحديث.' });
        }

        updateValues.push(expenseId, userId);
        db.prepare(`
            UPDATE expenses SET ${updateFields.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = ? AND user_id = ?
        `).run(...updateValues);

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'UPDATE_EXPENSE', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, expenseId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        const updated = db.prepare('SELECT id, type, amount, date, description, property_id AS propertyId FROM expenses WHERE id = ?').get(expenseId);

        return res.status(200).json({
            success: true,
            message: '✓ تم تحديث المصروف بنجاح.',
            data: updated,
        });

    } catch (error) {
        next(error);
    }
}

function deleteExpense(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const expenseId = parseInt(req.params.id, 10);

        if (isNaN(expenseId)) {
            return res.status(400).json({ success: false, message: 'معرف المصروف غير صالح.' });
        }

        const expense = db.prepare('SELECT id, type, amount, description FROM expenses WHERE id = ? AND user_id = ?').get(expenseId, userId);
        if (!expense) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على المصروف.' });
        }

        db.prepare('DELETE FROM expenses WHERE id = ?').run(expenseId);

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, details, created_at)
            VALUES (?, 'DELETE_EXPENSE', ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, expenseId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown',
               JSON.stringify({ type: expense.type, amount: expense.amount, description: expense.description }));

        return res.status(200).json({
            success: true,
            message: '✓ تم حذف المصروف نهائياً.',
        });

    } catch (error) {
        next(error);
    }
}

function getExpenseSummary(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { from_date, to_date } = req.query;

        let dateFilter = '';
        const params = [userId];

        if (from_date && to_date) {
            dateFilter = ' AND e.date >= ? AND e.date <= ?';
            params.push(from_date, to_date);
        } else {
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
            dateFilter = ' AND e.date >= ?';
            params.push(firstDay);
        }

        const totalExpenses = db.prepare(`
            SELECT COALESCE(SUM(e.amount), 0) AS total,
                   COUNT(*) AS count
            FROM expenses e
            WHERE e.user_id = ?${dateFilter}
        `).get(...params);

        const byProperty = db.prepare(`
            SELECT
                e.property_id AS propertyId,
                COALESCE(p.name, '(بدون عقار)') AS propertyName,
                COUNT(*) AS count,
                SUM(e.amount) AS total
            FROM expenses e
            LEFT JOIN properties p ON e.property_id = p.id
            WHERE e.user_id = ?${dateFilter}
            GROUP BY e.property_id
            ORDER BY total DESC
        `).all(...params);

        const byType = db.prepare(`
            SELECT
                e.type,
                COUNT(*) AS count,
                SUM(e.amount) AS total
            FROM expenses e
            WHERE e.user_id = ?${dateFilter}
            GROUP BY e.type
            ORDER BY total DESC
        `).all(...params);

        const typeLabels = {
            Maintenance: 'صيانة', Utilities: 'فواتير', Repairs: 'إصلاحات',
            Cleaning: 'تنظيف', MunicipalityFees: 'رسوم بلدية', Insurance: 'تأمين', Other: 'أخرى',
        };
        const byTypeLabeled = byType.map(t => ({ ...t, typeLabel: typeLabels[t.type] || t.type }));

        return res.status(200).json({
            success: true,
            data: {
                summary: totalExpenses,
                byProperty,
                byType: byTypeLabeled,
            },
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    listExpenses,
    getExpense,
    createExpense,
    updateExpense,
    deleteExpense,
    getExpenseSummary,
};
