'use strict';

const cron = require('node-cron');
const { getDatabase } = require('./database');

function generateMonthlyInvoices() {
    try {
        const db = getDatabase();
        const now = new Date();
        const billingYear = now.getUTCFullYear();
        const billingMonth = now.getUTCMonth() + 1;

        const activeContracts = db.prepare(`
            SELECT
                c.id, c.tenant_id, c.unit_id, c.monthly_rent,
                t.user_id
            FROM contracts c
            JOIN tenants t ON c.tenant_id = t.id
            WHERE c.status = 'Active'
              AND (c.end_date IS NULL OR c.end_date >= date('now'))
        `).all();

        let createdCount = 0;

        for (const contract of activeContracts) {
            const existing = db.prepare(`
                SELECT id FROM invoices
                WHERE contract_id = ? AND billing_month = ? AND billing_year = ?
            `).get(contract.id, billingMonth, billingYear);

            if (existing) continue;

            const dueDaySetting = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'dueDay'").get(contract.user_id);
            const dueDay = dueDaySetting ? parseInt(dueDaySetting.value, 10) : 5;
            const daysInMonth = new Date(billingYear, billingMonth, 0).getDate();
            const safeDueDay = Math.min(dueDay, daysInMonth);
            const dueDateStr = `${billingYear}-${String(billingMonth).padStart(2, '0')}-${String(safeDueDay).padStart(2, '0')}`;

            const seq = db.prepare(`
                SELECT COALESCE(COUNT(*), 0) + 1 AS seq
                FROM invoices WHERE billing_month = ? AND billing_year = ?
            `).get(billingMonth, billingYear).seq;

            const invoiceNumber = `INV-${billingYear}-${String(billingMonth).padStart(2, '0')}-${String(seq).padStart(3, '0')}`;

            db.prepare(`
                INSERT INTO invoices (contract_id, unit_id, tenant_id, invoice_number,
                                      billing_month, billing_year, amount, due_date, status,
                                      created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Unpaid',
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            `).run(contract.id, contract.unit_id, contract.tenant_id, invoiceNumber,
                   billingMonth, billingYear, contract.monthly_rent, dueDateStr);

            createdCount++;
        }

        if (createdCount > 0) {
            console.log(`[CRON] Generated ${createdCount} new invoice(s) for ${billingYear}-${String(billingMonth).padStart(2, '0')}`);
        }

    } catch (error) {
        console.error('[CRON] Error generating monthly invoices:', error.message);
    }
}

function markOverdueInvoices() {
    try {
        const db = getDatabase();
        const today = new Date().toISOString().slice(0, 10);

        const result = db.prepare(`
            UPDATE invoices SET status = 'Overdue', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE status IN ('Unpaid', 'Partial')
              AND due_date < ?
        `).run(today);

        if (result.changes > 0) {
            console.log(`[CRON] Marked ${result.changes} invoice(s) as overdue`);
        }

    } catch (error) {
        console.error('[CRON] Error marking overdue invoices:', error.message);
    }
}

function startCronJobs() {
    cron.schedule('0 0 * * *', () => {
        console.log('[CRON] Running daily tasks...');
        generateMonthlyInvoices();
        markOverdueInvoices();
        console.log('[CRON] Daily tasks completed.');
    });

    console.log('[CRON] Scheduled daily job at midnight (0 0 * * *)');
}

module.exports = {
    startCronJobs,
    generateMonthlyInvoices,
    markOverdueInvoices,
};
