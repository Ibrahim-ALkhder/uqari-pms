'use strict';

const { getDatabase } = require('../database');

function getSummary(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;

        const totalProperties = db.prepare('SELECT COUNT(*) AS count FROM properties WHERE user_id = ?').get(userId).count;

        const totalUnits = db.prepare('SELECT COUNT(*) AS count FROM units u JOIN properties p ON u.property_id = p.id WHERE p.user_id = ?').get(userId).count;

        const occupiedUnits = db.prepare("SELECT COUNT(*) AS count FROM units u JOIN properties p ON u.property_id = p.id WHERE p.user_id = ? AND u.status = 'Occupied'").get(userId).count;

        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

        const activeTenants = db.prepare('SELECT COUNT(*) AS count FROM tenants WHERE user_id = ? AND is_former = 0').get(userId).count;

        const totalMonthlyIncome = db.prepare(`
            SELECT COALESCE(SUM(c.monthly_rent), 0) AS total
            FROM contracts c
            JOIN units u ON c.unit_id = u.id
            JOIN properties p ON u.property_id = p.id
            WHERE p.user_id = ? AND c.status = 'Active'
        `).get(userId).total;

        const overdueAmount = db.prepare(`
            SELECT COALESCE(SUM(i.amount - COALESCE((SELECT SUM(py.amount) FROM payments py WHERE py.invoice_id = i.id), 0)), 0) AS total
            FROM invoices i
            JOIN tenants t ON i.tenant_id = t.id
            WHERE t.user_id = ? AND i.status IN ('Unpaid', 'Overdue', 'Partial')
              AND i.due_date < date('now')
        `).get(userId).total;

        const unpaidCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM invoices i
            JOIN tenants t ON i.tenant_id = t.id
            WHERE t.user_id = ? AND i.status IN ('Unpaid', 'Overdue', 'Partial')
        `).get(userId).count;

        const pendingTickets = db.prepare(`
            SELECT COUNT(*) AS count
            FROM maintenance_tickets
            WHERE user_id = ? AND status IN ('Open', 'InProgress')
        `).get(userId).count;

        const recentPayments = db.prepare(`
            SELECT
                py.id,
                py.amount,
                py.payment_date AS paymentDate,
                py.payment_method AS paymentMethod,
                i.invoice_number AS invoiceNumber,
                t.full_name AS tenantName
            FROM payments py
            JOIN invoices i ON py.invoice_id = i.id
            JOIN tenants t ON i.tenant_id = t.id
            WHERE t.user_id = ?
            ORDER BY py.created_at DESC
            LIMIT 5
        `).all(userId);

        return res.status(200).json({
            success: true,
            data: {
                totalProperties,
                totalUnits,
                occupiedUnits,
                occupancyRate,
                activeTenants,
                totalMonthlyIncome,
                overdueAmount,
                unpaidCount,
                pendingTickets,
                recentPayments,
            },
        });

    } catch (error) {
        next(error);
    }
}

function getIncomeExpenses(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const months = parseInt(req.query.months, 10) || 12;

        const incomeData = db.prepare(`
            SELECT
                i.billing_year AS year,
                i.billing_month AS month,
                COALESCE(SUM(py.amount), 0) AS totalIncome
            FROM invoices i
            JOIN tenants t ON i.tenant_id = t.id
            LEFT JOIN payments py ON py.invoice_id = i.id
            WHERE t.user_id = ?
            GROUP BY i.billing_year, i.billing_month
            ORDER BY i.billing_year DESC, i.billing_month DESC
            LIMIT ?
        `).all(userId, months);

        const expenseData = db.prepare(`
            SELECT
                CAST(strftime('%Y', date) AS INTEGER) AS year,
                CAST(strftime('%m', date) AS INTEGER) AS month,
                COALESCE(SUM(amount), 0) AS totalExpenses
            FROM expenses
            WHERE user_id = ?
            GROUP BY year, month
            ORDER BY year DESC, month DESC
            LIMIT ?
        `).all(userId, months);

        return res.status(200).json({
            success: true,
            data: { income: incomeData, expenses: expenseData },
        });

    } catch (error) {
        next(error);
    }
}

function getRecentActivity(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;

        const recentInvoices = db.prepare(`
            SELECT
                i.id,
                i.invoice_number AS invoiceNumber,
                i.amount,
                i.status,
                i.due_date AS dueDate,
                t.full_name AS tenantName,
                i.created_at AS createdAt
            FROM invoices i
            JOIN tenants t ON i.tenant_id = t.id
            WHERE t.user_id = ?
            ORDER BY i.created_at DESC
            LIMIT 5
        `).all(userId);

        const recentTickets = db.prepare(`
            SELECT
                mt.id,
                mt.description,
                mt.urgency,
                mt.status,
                u.unit_number AS unitNumber,
                mt.created_at AS createdAt
            FROM maintenance_tickets mt
            JOIN units u ON mt.unit_id = u.id
            WHERE mt.user_id = ?
            ORDER BY mt.created_at DESC
            LIMIT 5
        `).all(userId);

        const recentExpenses = db.prepare(`
            SELECT
                e.id,
                e.type,
                e.amount,
                e.date,
                e.description
            FROM expenses e
            WHERE e.user_id = ?
            ORDER BY e.created_at DESC
            LIMIT 5
        `).all(userId);

        return res.status(200).json({
            success: true,
            data: {
                invoices: recentInvoices,
                maintenanceTickets: recentTickets,
                expenses: recentExpenses,
            },
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    getSummary,
    getIncomeExpenses,
    getRecentActivity,
};
