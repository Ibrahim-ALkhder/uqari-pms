'use strict';

const { getDatabase } = require('../database');
const { paginate, paginatedResponse } = require('../helpers/pagination');

function listTickets(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { status, urgency, unitId, page, limit } = req.query;

        let whereClause = '';
        const params = [userId];

        const validStatuses = ['Open', 'InProgress', 'Resolved'];
        if (status && validStatuses.includes(status)) {
            whereClause += ' AND mt.status = ?';
            params.push(status);
        }

        const validUrgencies = ['Low', 'Medium', 'High', 'Emergency'];
        if (urgency && validUrgencies.includes(urgency)) {
            whereClause += ' AND mt.urgency = ?';
            params.push(urgency);
        }

        if (unitId) {
            const parsed = parseInt(unitId, 10);
            if (!isNaN(parsed)) { whereClause += ' AND mt.unit_id = ?'; params.push(parsed); }
        }

        const orderBy = ' ORDER BY CASE mt.urgency WHEN \'Emergency\' THEN 0 WHEN \'High\' THEN 1 WHEN \'Medium\' THEN 2 WHEN \'Low\' THEN 3 END, mt.created_at DESC';

        const total = db.prepare(`
            SELECT COUNT(*) AS count
            FROM maintenance_tickets mt
            JOIN units u ON mt.unit_id = u.id
            JOIN properties p ON u.property_id = p.id
            WHERE mt.user_id = ?${whereClause}
        `).get(...params).count;

        const { data, pagination } = paginate(
            (args) => db.prepare(`
                SELECT
                    mt.id,
                    mt.unit_id AS unitId,
                    u.unit_number AS unitNumber,
                    p.name AS propertyName,
                    mt.reported_by AS reportedBy,
                    mt.description,
                    mt.urgency,
                    mt.status,
                    mt.issue_image_path AS issueImagePath,
                    mt.resolved_at AS resolvedAt,
                    mt.created_at AS createdAt,
                    mt.updated_at AS updatedAt
                FROM maintenance_tickets mt
                JOIN units u ON mt.unit_id = u.id
                JOIN properties p ON u.property_id = p.id
                WHERE mt.user_id = ?${whereClause}${orderBy}
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

function getTicket(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const ticketId = parseInt(req.params.id, 10);

        if (isNaN(ticketId)) {
            return res.status(400).json({ success: false, message: 'معرف تذكرة الصيانة غير صالح.' });
        }

        const ticket = db.prepare(`
            SELECT
                mt.id,
                mt.unit_id AS unitId,
                u.unit_number AS unitNumber,
                p.name AS propertyName,
                mt.reported_by AS reportedBy,
                mt.description,
                mt.urgency,
                mt.status,
                mt.issue_image_path AS issueImagePath,
                mt.resolved_at AS resolvedAt,
                mt.created_at AS createdAt,
                mt.updated_at AS updatedAt
            FROM maintenance_tickets mt
            JOIN units u ON mt.unit_id = u.id
            JOIN properties p ON u.property_id = p.id
            WHERE mt.id = ? AND mt.user_id = ?
        `).get(ticketId, userId);

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على تذكرة الصيانة.' });
        }

        return res.status(200).json({ success: true, data: ticket });

    } catch (error) {
        next(error);
    }
}

function createTicket(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { unitId, reportedBy, description, urgency } = req.body;

        const errors = [];

        const parsedUnitId = parseInt(unitId, 10);
        if (!unitId || isNaN(parsedUnitId)) {
            errors.push({ field: 'unitId', message: 'معرف الوحدة مطلوب.' });
        } else {
            const unit = db.prepare(`
                SELECT u.id FROM units u
                JOIN properties p ON u.property_id = p.id
                WHERE u.id = ? AND p.user_id = ?
            `).get(parsedUnitId, userId);
            if (!unit) {
                errors.push({ field: 'unitId', message: 'الوحدة المحددة غير موجودة.' });
            }
        }

        if (!reportedBy || typeof reportedBy !== 'string' || reportedBy.trim().length < 2) {
            errors.push({ field: 'reportedBy', message: 'اسم المبلغ مطلوب ويجب أن يكون حرفين على الأقل.' });
        } else if (reportedBy.trim().length > 100) {
            errors.push({ field: 'reportedBy', message: 'الاسم طويل جداً. الحد الأقصى 100 حرف.' });
        }

        if (!description || typeof description !== 'string' || description.trim().length < 10) {
            errors.push({ field: 'description', message: 'وصف المشكلة مطلوب ويجب أن يكون 10 أحرف على الأقل.' });
        } else if (description.length > 2000) {
            errors.push({ field: 'description', message: 'الوصف طويل جداً. الحد الأقصى 2000 حرف.' });
        }

        const validUrgencies = ['Low', 'Medium', 'High', 'Emergency'];
        const finalUrgency = urgency || 'Medium';
        if (!validUrgencies.includes(finalUrgency)) {
            errors.push({ field: 'urgency', message: 'مستوى الاستعجال غير صالح.' });
        }

        if (errors.length > 0) {
            return res.status(422).json({ success: false, message: 'يرجى تصحيح الأخطاء التالية:', errors });
        }

        let issueImagePath = null;

        const result = db.prepare(`
            INSERT INTO maintenance_tickets (user_id, unit_id, reported_by, description, urgency, status, issue_image_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'Open', ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, parsedUnitId, reportedBy.trim(), description.trim(), finalUrgency, issueImagePath);

        const ticketId = result.lastInsertRowid;

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, details, created_at)
            VALUES (?, 'ADD_TICKET', ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, ticketId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown',
               JSON.stringify({ unitId: parsedUnitId, urgency: finalUrgency }));

        const urgencyLabels = { Low: 'منخفض', Medium: 'متوسط', High: 'عالي', Emergency: 'طارئ' };

        return res.status(201).json({
            success: true,
            message: `✓ تم إنشاء تذكرة الصيانة بنجاح. مستوى الاستعجال: ${urgencyLabels[finalUrgency]}.`,
            data: {
                id: ticketId,
                unitId: parsedUnitId,
                reportedBy: reportedBy.trim(),
                description: description.trim(),
                urgency: finalUrgency,
                status: 'Open',
            },
        });

    } catch (error) {
        next(error);
    }
}

function updateTicket(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const ticketId = parseInt(req.params.id, 10);

        if (isNaN(ticketId)) {
            return res.status(400).json({ success: false, message: 'معرف تذكرة الصيانة غير صالح.' });
        }

        const existing = db.prepare('SELECT id, status FROM maintenance_tickets WHERE id = ? AND user_id = ?').get(ticketId, userId);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على تذكرة الصيانة.' });
        }

        const { description, urgency, status } = req.body;
        const updateFields = [];
        const updateValues = [];
        const errors = [];

        if (description !== undefined) {
            if (description.trim().length < 10) {
                errors.push({ field: 'description', message: 'الوصف يجب أن يكون 10 أحرف على الأقل.' });
            } else {
                updateFields.push('description = ?');
                updateValues.push(description.trim());
            }
        }

        const validUrgencies = ['Low', 'Medium', 'High', 'Emergency'];
        if (urgency !== undefined) {
            if (!validUrgencies.includes(urgency)) {
                errors.push({ field: 'urgency', message: 'مستوى الاستعجال غير صالح.' });
            } else {
                updateFields.push('urgency = ?');
                updateValues.push(urgency);
            }
        }

        const validStatuses = ['Open', 'InProgress', 'Resolved'];
        if (status !== undefined) {
            if (!validStatuses.includes(status)) {
                errors.push({ field: 'status', message: 'الحالة غير صالحة.' });
            } else {
                updateFields.push('status = ?');
                updateValues.push(status);
                if (status === 'Resolved') {
                    updateFields.push('resolved_at = ?');
                    updateValues.push(new Date().toISOString().slice(0, 10));
                }
            }
        }

        if (errors.length > 0) {
            return res.status(422).json({ success: false, message: 'يرجى تصحيح الأخطاء التالية:', errors });
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: 'لم يتم إرسال أي بيانات للتحديث.' });
        }

        updateValues.push(ticketId, userId);
        db.prepare(`
            UPDATE maintenance_tickets SET ${updateFields.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = ? AND user_id = ?
        `).run(...updateValues);

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'UPDATE_TICKET', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, ticketId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        const updated = db.prepare('SELECT id, description, urgency, status, resolved_at AS resolvedAt FROM maintenance_tickets WHERE id = ?').get(ticketId);

        return res.status(200).json({
            success: true,
            message: '✓ تم تحديث تذكرة الصيانة بنجاح.',
            data: updated,
        });

    } catch (error) {
        next(error);
    }
}

function resolveTicket(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const ticketId = parseInt(req.params.id, 10);

        if (isNaN(ticketId)) {
            return res.status(400).json({ success: false, message: 'معرف تذكرة الصيانة غير صالح.' });
        }

        const ticket = db.prepare('SELECT id, status FROM maintenance_tickets WHERE id = ? AND user_id = ?').get(ticketId, userId);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على تذكرة الصيانة.' });
        }

        if (ticket.status === 'Resolved') {
            return res.status(400).json({ success: false, message: 'تذكرة الصيانة تم حلها بالفعل.' });
        }

        const today = new Date().toISOString().slice(0, 10);

        db.prepare(`
            UPDATE maintenance_tickets SET status = 'Resolved', resolved_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = ?
        `).run(today, ticketId);

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'RESOLVE_TICKET', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, ticketId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        return res.status(200).json({
            success: true,
            message: '✓ تم تأكيد حل المشكلة. شكراً لمتابعتك.',
            data: { id: ticketId, status: 'Resolved', resolvedAt: today },
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    listTickets,
    getTicket,
    createTicket,
    updateTicket,
    resolveTicket,
};
