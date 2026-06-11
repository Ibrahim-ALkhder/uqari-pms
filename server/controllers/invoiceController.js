'use strict';

const { getDatabase } = require('../database');
const { paginate, paginatedResponse } = require('../helpers/pagination');

const SELECT_COLUMNS = `
    SELECT
        i.id,
        i.invoice_number AS invoiceNumber,
        i.contract_id AS contractId,
        i.unit_id AS unitId,
        u.unit_number AS unitNumber,
        p.name AS propertyName,
        i.tenant_id AS tenantId,
        t.full_name AS tenantName,
        i.billing_month AS billingMonth,
        i.billing_year AS billingYear,
        i.amount,
        i.due_date AS dueDate,
        i.status,
        i.notes,
        COALESCE((SELECT SUM(py.amount) FROM payments py WHERE py.invoice_id = i.id), 0) AS paidAmount,
        i.created_at AS createdAt
    FROM invoices i
    JOIN tenants t ON i.tenant_id = t.id
    JOIN units u ON i.unit_id = u.id
    JOIN properties p ON u.property_id = p.id
    WHERE t.user_id = ?
`;

function listInvoices(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { status, contractId, tenantId, unitId, billingMonth, billingYear, page, limit } = req.query;

        let whereClause = '';
        const params = [userId];

        if (status) {
            const validStatuses = ['Unpaid', 'Paid', 'Partial', 'Overdue', 'Cancelled'];
            if (validStatuses.includes(status)) {
                whereClause += ' AND i.status = ?';
                params.push(status);
            }
        }

        if (contractId) {
            const parsed = parseInt(contractId, 10);
            if (!isNaN(parsed)) { whereClause += ' AND i.contract_id = ?'; params.push(parsed); }
        }

        if (tenantId) {
            const parsed = parseInt(tenantId, 10);
            if (!isNaN(parsed)) { whereClause += ' AND i.tenant_id = ?'; params.push(parsed); }
        }

        if (unitId) {
            const parsed = parseInt(unitId, 10);
            if (!isNaN(parsed)) { whereClause += ' AND i.unit_id = ?'; params.push(parsed); }
        }

        if (billingMonth) {
            const parsed = parseInt(billingMonth, 10);
            if (parsed >= 1 && parsed <= 12) { whereClause += ' AND i.billing_month = ?'; params.push(parsed); }
        }

        if (billingYear) {
            const parsed = parseInt(billingYear, 10);
            if (parsed >= 2020 && parsed <= 2099) { whereClause += ' AND i.billing_year = ?'; params.push(parsed); }
        }

        const orderBy = ' ORDER BY i.billing_year DESC, i.billing_month DESC, i.created_at DESC';

        const total = db.prepare(
            `SELECT COUNT(*) AS count FROM invoices i JOIN tenants t ON i.tenant_id = t.id WHERE t.user_id = ?${whereClause}`
        ).get(...params).count;

        const { data, pagination } = paginate(
            (args) => db.prepare(SELECT_COLUMNS + whereClause + orderBy + ' LIMIT ? OFFSET ?').all(...args),
            params,
            page,
            limit,
        );

        return paginatedResponse(res, total, data, pagination);

    } catch (error) {
        next(error);
    }
}

function getInvoice(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const invoiceId = parseInt(req.params.id, 10);

        if (isNaN(invoiceId)) {
            return res.status(400).json({ success: false, message: 'معرف الفاتورة غير صالح.' });
        }

        const invoice = db.prepare(`
            SELECT
                i.id,
                i.invoice_number AS invoiceNumber,
                i.contract_id AS contractId,
                i.unit_id AS unitId,
                u.unit_number AS unitNumber,
                p.name AS propertyName,
                i.tenant_id AS tenantId,
                t.full_name AS tenantName,
                t.phone AS tenantPhone,
                i.billing_month AS billingMonth,
                i.billing_year AS billingYear,
                i.amount,
                i.due_date AS dueDate,
                i.status,
                i.notes,
                i.created_at AS createdAt,
                i.updated_at AS updatedAt
            FROM invoices i
            JOIN tenants t ON i.tenant_id = t.id
            JOIN units u ON i.unit_id = u.id
            JOIN properties p ON u.property_id = p.id
            WHERE i.id = ? AND t.user_id = ?
        `).get(invoiceId, userId);

        if (!invoice) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على الفاتورة.' });
        }

        const payments = db.prepare(`
            SELECT
                py.id,
                py.amount,
                py.payment_date AS paymentDate,
                py.payment_method AS paymentMethod,
                py.notes,
                py.created_at AS createdAt
            FROM payments py
            WHERE py.invoice_id = ?
            ORDER BY py.created_at ASC
        `).all(invoiceId);

        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const remaining = invoice.amount - totalPaid;

        return res.status(200).json({
            success: true,
            data: {
                ...invoice,
                payments,
                totalPaid,
                remaining: remaining > 0 ? remaining : 0,
            },
        });

    } catch (error) {
        next(error);
    }
}

function getOverdueInvoices(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const today = new Date().toISOString().slice(0, 10);

        const invoices = db.prepare(`
            SELECT
                i.id,
                i.invoice_number AS invoiceNumber,
                i.contract_id AS contractId,
                i.unit_id AS unitId,
                u.unit_number AS unitNumber,
                p.name AS propertyName,
                i.tenant_id AS tenantId,
                t.full_name AS tenantName,
                t.phone AS tenantPhone,
                i.billing_month AS billingMonth,
                i.billing_year AS billingYear,
                i.amount,
                i.due_date AS dueDate,
                i.status,
                COALESCE((SELECT SUM(py.amount) FROM payments py WHERE py.invoice_id = i.id), 0) AS paidAmount,
                (i.amount - COALESCE((SELECT SUM(py.amount) FROM payments py WHERE py.invoice_id = i.id), 0)) AS remaining
            FROM invoices i
            JOIN tenants t ON i.tenant_id = t.id
            JOIN units u ON i.unit_id = u.id
            JOIN properties p ON u.property_id = p.id
            WHERE t.user_id = ?
              AND i.status IN ('Unpaid', 'Overdue', 'Partial')
              AND i.due_date < ?
            ORDER BY i.due_date ASC
        `).all(userId, today);

        return res.status(200).json({ success: true, data: invoices });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    listInvoices,
    getInvoice,
    getOverdueInvoices,
};
