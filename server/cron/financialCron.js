'use strict';

const cron = require('node-cron');
const { getDatabase } = require('../database');

function autoGenerateInvoices() {
    try {
        const db = getDatabase();
        const now = new Date();
        const today = now.getDate();
        const billingYear = now.getFullYear();
        const billingMonth = now.getMonth() + 1;

        const activeContracts = db.prepare(`
            SELECT
                c.id, c.tenant_id, c.unit_id, c.monthly_rent,
                t.user_id, t.credit_balance
            FROM contracts c
            JOIN tenants t ON c.tenant_id = t.id
            WHERE c.status = 'Active'
              AND (c.end_date IS NULL OR c.end_date >= date('now'))
        `).all();

        if (activeContracts.length === 0) {
            return;
        }

        const usersChecked = new Set();
        let createdCount = 0;
        let creditAppliedCount = 0;
        let skippedDayMismatch = 0;

        for (const contract of activeContracts) {
            if (!usersChecked.has(contract.user_id)) {
                usersChecked.add(contract.user_id);
            }

            const billingDaySetting = db.prepare(
                "SELECT value FROM settings WHERE user_id = ? AND key = 'billingDay'"
            ).get(contract.user_id);
            const billingDay = billingDaySetting ? parseInt(billingDaySetting.value, 10) : 1;

            if (today !== billingDay) {
                skippedDayMismatch++;
                continue;
            }

            const existing = db.prepare(`
                SELECT id FROM invoices
                WHERE contract_id = ? AND billing_month = ? AND billing_year = ?
            `).get(contract.id, billingMonth, billingYear);

            if (existing) continue;

            const dueDaySetting = db.prepare(
                "SELECT value FROM settings WHERE user_id = ? AND key = 'dueDay'"
            ).get(contract.user_id);
            const dueDay = dueDaySetting ? parseInt(dueDaySetting.value, 10) : 5;
            const daysInMonth = new Date(billingYear, billingMonth, 0).getDate();
            const safeDueDay = Math.min(dueDay, daysInMonth);
            const dueDateStr = `${billingYear}-${String(billingMonth).padStart(2, '0')}-${String(safeDueDay).padStart(2, '0')}`;

            const seq = db.prepare(`
                SELECT COALESCE(COUNT(*), 0) + 1 AS seq
                FROM invoices WHERE billing_month = ? AND billing_year = ?
            `).get(billingMonth, billingYear).seq;

            const invoiceNumber = `INV-${billingYear}-${String(billingMonth).padStart(2, '0')}-${String(seq).padStart(3, '0')}`;

            const autoCreateTransaction = db.transaction(() => {
                db.prepare(`
                    INSERT INTO invoices (contract_id, unit_id, tenant_id, invoice_number,
                                          billing_month, billing_year, amount, due_date, status,
                                          created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Unpaid',
                            strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                            strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                `).run(contract.id, contract.unit_id, contract.tenant_id, invoiceNumber,
                       billingMonth, billingYear, contract.monthly_rent, dueDateStr);

                const newInvoiceId = db.prepare(
                    'SELECT id FROM invoices WHERE invoice_number = ?'
                ).get(invoiceNumber).id;

                // Auto-apply tenant credit if available
                if (contract.credit_balance > 0) {
                    const creditToApply = Math.min(contract.credit_balance, contract.monthly_rent);

                    db.prepare(`
                        INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes, created_at)
                        VALUES (?, ?, ?, 'Credit', ?,
                                strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                    `).run(newInvoiceId, creditToApply, dueDateStr,
                           `رصيد دائن مطبق تلقائياً من دفعات سابقة`);

                    const remainingRent = contract.monthly_rent - creditToApply;
                    if (remainingRent <= 0) {
                        db.prepare(`
                            UPDATE invoices SET status = 'Paid',
                                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                            WHERE id = ?
                        `).run(newInvoiceId);
                    }

                    db.prepare(`
                        UPDATE tenants SET credit_balance = credit_balance - ?,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                        WHERE id = ?
                    `).run(creditToApply, contract.tenant_id);

                    creditAppliedCount++;
                }

                return { newInvoiceId };
            });

            autoCreateTransaction();
            createdCount++;
        }

        if (createdCount > 0) {
            console.log(`[مالي] تم إنشاء ${createdCount} فاتورة جديدة لشهر ${billingYear}-${String(billingMonth).padStart(2, '0')}`);
        }

        if (creditAppliedCount > 0) {
            console.log(`[مالي] تم تطبيق رصيد دائن على ${creditAppliedCount} فاتورة.`);
        }

        if (skippedDayMismatch > 0 && createdCount === 0) {
            console.log(`[مالي] اليوم ${today} لا يتطابق مع يوم الفوترة لـ ${skippedDayMismatch} عقد. لم يتم إنشاء فواتير جديدة.`);
        }

    } catch (error) {
        console.error('[مالي] خطأ في إنشاء الفواتير الشهرية:', error.message);
    }
}

function escalateOverdueInvoices() {
    try {
        const db = getDatabase();
        const today = new Date().toISOString().slice(0, 10);

        const result = db.prepare(`
            UPDATE invoices SET status = 'Overdue', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE status IN ('Unpaid', 'Partial')
              AND due_date < ?
        `).run(today);

        if (result.changes > 0) {
            const affectedInvoices = db.prepare(`
                SELECT
                    COUNT(*) AS count,
                    COALESCE(SUM(i.amount - COALESCE((
                        SELECT SUM(py.amount) FROM payments py WHERE py.invoice_id = i.id
                    ), 0)), 0) AS totalOverdue
                FROM invoices i
                WHERE i.status = 'Overdue'
                  AND i.updated_at >= datetime('now', '-1 hour')
            `).get();

            console.log(`[مالي] تم تصعيد ${result.changes} فاتورة إلى متأخرة. إجمالي المستحق: ${affectedInvoices.totalOverdue.toFixed(2)} ريال`);
        }

    } catch (error) {
        console.error('[مالي] خطأ في تصعيد الفواتير المتأخرة:', error.message);
    }
}

function startFinancialCron() {
    cron.schedule('0 0 * * *', () => {
        console.log('[مالي] بدء المهام المالية اليومية في منتصف الليل...');
        autoGenerateInvoices();
        escalateOverdueInvoices();
        console.log('[مالي] اكتملت المهام المالية اليومية بنجاح.');
    });

    console.log('[مالي] تم جدولة المحرك المالي اليومي عند منتصف الليل (0 0 * * *)');
}

module.exports = {
    startFinancialCron,
    autoGenerateInvoices,
    escalateOverdueInvoices,
};
