'use strict';

const { getDatabase } = require('../database');
const { paginate, paginatedResponse } = require('../helpers/pagination');

function recordPayment(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { invoiceId, amount, paymentDate, paymentMethod, notes } = req.body;

        const errors = [];

        const parsedInvoiceId = parseInt(invoiceId, 10);
        if (!invoiceId || isNaN(parsedInvoiceId)) {
            errors.push({ field: 'invoiceId', message: 'معرف الفاتورة مطلوب.' });
        }

        const parsedAmount = parseFloat(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            errors.push({ field: 'amount', message: 'المبلغ المدفوع يجب أن يكون أكبر من صفر.' });
        }

        if (!paymentDate || typeof paymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
            errors.push({ field: 'paymentDate', message: 'تاريخ الدفع مطلوب بصيغة YYYY-MM-DD.' });
        }

        const validMethods = ['Cash', 'BankTransfer', 'Cheque'];
        if (!paymentMethod || !validMethods.includes(paymentMethod)) {
            errors.push({ field: 'paymentMethod', message: 'طريقة الدفع غير صالحة. الطرق المتاحة: نقدي، تحويل بنكي، شيك.' });
        }

        if (notes && typeof notes === 'string' && notes.length > 250) {
            errors.push({ field: 'notes', message: 'الملاحظات طويلة جداً. الحد الأقصى 250 حرفاً.' });
        }

        if (errors.length > 0) {
            return res.status(422).json({
                success: false,
                message: 'يرجى تصحيح الأخطاء التالية:',
                errors,
            });
        }

        const invoice = db.prepare(`
            SELECT i.id, i.amount, i.status, i.contract_id, i.unit_id, i.tenant_id,
                   t.full_name AS tenantName, t.id AS tenantId
            FROM invoices i
            JOIN tenants t ON i.tenant_id = t.id
            WHERE i.id = ? AND t.user_id = ?
        `).get(parsedInvoiceId, userId);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على الفاتورة المحددة.',
            });
        }

        if (invoice.status === 'Paid') {
            return res.status(400).json({
                success: false,
                message: 'هذه الفاتورة مدفوعة بالكامل بالفعل. لا يمكن إضافة دفعة جديدة.',
            });
        }

        if (invoice.status === 'Cancelled') {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن إضافة دفعة لفاتورة ملغاة.',
            });
        }

        const totalPaidSoFar = db.prepare(
            'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = ?'
        ).get(parsedInvoiceId).total;

        const balanceDue = invoice.amount - totalPaidSoFar;
        const newTotal = totalPaidSoFar + parsedAmount;

        let creditAmount = 0;

        const paymentTransaction = db.transaction(() => {
            let invoiceNotes = null;
            let finalStatus;

            if (parsedAmount >= balanceDue) {
                finalStatus = 'Paid';
                creditAmount = parsedAmount - balanceDue;

                if (creditAmount > 0) {
                    const creditNotes = `زيادة مدفوعة: ${creditAmount.toFixed(2)} ريال كرصيد دائن للمستأجر. يمكن استخدام هذا الرصيد في الفواتير القادمة.`;
                    invoiceNotes = invoice.notes
                        ? invoice.notes + ' | ' + creditNotes
                        : creditNotes;

                    db.prepare(`
                        UPDATE tenants SET credit_balance = credit_balance + ?,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                        WHERE id = ?
                    `).run(creditAmount, invoice.tenantId);
                }
            } else {
                finalStatus = 'Partial';
            }

            const paymentNotes = notes || null;

            const paymentResult = db.prepare(`
                INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes, created_at)
                VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            `).run(parsedInvoiceId, parsedAmount, paymentDate, paymentMethod, paymentNotes);

            const paymentId = paymentResult.lastInsertRowid;

            if (invoiceNotes) {
                db.prepare(`
                    UPDATE invoices SET status = ?, notes = ?,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                    WHERE id = ?
                `).run(finalStatus, invoiceNotes, parsedInvoiceId);
            } else {
                db.prepare(`
                    UPDATE invoices SET status = ?,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                    WHERE id = ?
                `).run(finalStatus, parsedInvoiceId);
            }

            return { paymentId, finalStatus };
        });

        const { paymentId, finalStatus } = paymentTransaction();

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, details, created_at)
            VALUES (?, 'RECORD_PAYMENT', ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, parsedInvoiceId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown',
               JSON.stringify({
                   invoiceId: parsedInvoiceId,
                   amount: parsedAmount,
                   method: paymentMethod,
                   credit: creditAmount,
                   status: finalStatus,
               }));

        const statusLabels = {
            Paid: 'مدفوعة بالكامل',
            Partial: 'مدفوعة جزئياً',
            Overdue: 'متأخرة',
            Unpaid: 'غير مدفوعة',
            Cancelled: 'ملغاة',
        };

        if (creditAmount > 0) {
            return res.status(200).json({
                success: true,
                message: `✓ تم تسجيل الدفعة بنجاح. الفاتورة مدفوعة بالكامل. يوجد زيادة بقيمة ${creditAmount.toFixed(2)} ريال كرصيد دائن للمستأجر يمكن استخدامه في الشهر القادم.`,
                data: {
                    payment: {
                        id: paymentId,
                        invoiceId: parsedInvoiceId,
                        amount: parsedAmount,
                        paymentDate,
                        paymentMethod,
                    },
                    invoice: {
                        id: parsedInvoiceId,
                        status: finalStatus,
                        totalPaid: newTotal,
                        balanceDue: 0,
                        creditAmount,
                    },
                    credit: {
                        amount: creditAmount,
                        message: `رصيد دائن للمستأجر ${invoice.tenantName} بمبلغ ${creditAmount.toFixed(2)} ريال`,
                    },
                },
            });
        }

        const remainingAfter = Math.max(0, invoice.amount - newTotal);

        return res.status(200).json({
            success: true,
            message: `✓ تم تسجيل الدفعة بنجاح. حالة الفاتورة: ${statusLabels[finalStatus]}.`,
            data: {
                payment: {
                    id: paymentId,
                    invoiceId: parsedInvoiceId,
                    amount: parsedAmount,
                    paymentDate,
                    paymentMethod,
                },
                invoice: {
                    id: parsedInvoiceId,
                    status: finalStatus,
                    totalPaid: newTotal,
                    balanceDue: remainingAfter,
                    creditAmount: 0,
                },
            },
        });

    } catch (error) {
        next(error);
    }
}

function listPayments(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { invoiceId, paymentMethod, fromDate, toDate, page, limit } = req.query;

        let whereClause = '';
        const params = [userId];

        if (invoiceId) {
            const parsed = parseInt(invoiceId, 10);
            if (!isNaN(parsed)) { whereClause += ' AND py.invoice_id = ?'; params.push(parsed); }
        }

        const validMethods = ['Cash', 'BankTransfer', 'Cheque', 'Credit'];
        if (paymentMethod && validMethods.includes(paymentMethod)) {
            whereClause += ' AND py.payment_method = ?';
            params.push(paymentMethod);
        }

        if (fromDate) {
            whereClause += ' AND py.payment_date >= ?';
            params.push(fromDate);
        }

        if (toDate) {
            whereClause += ' AND py.payment_date <= ?';
            params.push(toDate);
        }

        const total = db.prepare(`
            SELECT COUNT(*) AS count
            FROM payments py
            JOIN invoices i ON py.invoice_id = i.id
            JOIN tenants t ON i.tenant_id = t.id
            WHERE t.user_id = ?${whereClause}
        `).get(...params).count;

        const { data, pagination } = paginate(
            (args) => db.prepare(`
                SELECT
                    py.id,
                    py.invoice_id AS invoiceId,
                    i.invoice_number AS invoiceNumber,
                    i.amount AS invoiceAmount,
                    py.amount,
                    py.payment_date AS paymentDate,
                    py.payment_method AS paymentMethod,
                    py.notes,
                    t.full_name AS tenantName,
                    u.unit_number AS unitNumber,
                    p.name AS propertyName,
                    py.created_at AS createdAt
                FROM payments py
                JOIN invoices i ON py.invoice_id = i.id
                JOIN tenants t ON i.tenant_id = t.id
                JOIN units u ON i.unit_id = u.id
                JOIN properties p ON u.property_id = p.id
                WHERE t.user_id = ?${whereClause}
                ORDER BY py.created_at DESC
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

function getTenantCredit(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const tenantId = parseInt(req.params.tenantId, 10);

        if (isNaN(tenantId)) {
            return res.status(400).json({ success: false, message: 'معرف المستأجر غير صالح.' });
        }

        const tenant = db.prepare('SELECT id, full_name, credit_balance FROM tenants WHERE id = ? AND user_id = ?').get(tenantId, userId);
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'عذراً، لم يتم العثور على المستأجر.' });
        }

        const overpayments = db.prepare(`
            SELECT
                py.id AS paymentId,
                py.amount,
                py.payment_date AS paymentDate,
                i.invoice_number AS invoiceNumber,
                i.id AS invoiceId,
                i.amount AS invoiceAmount,
                (SELECT COALESCE(SUM(py2.amount), 0) FROM payments py2 WHERE py2.invoice_id = i.id) AS totalPaidOnInvoice,
                (SELECT COALESCE(SUM(py2.amount), 0) FROM payments py2 WHERE py2.invoice_id = i.id) - i.amount AS overpaymentAmount
            FROM payments py
            JOIN invoices i ON py.invoice_id = i.id
            WHERE i.tenant_id = ?
              AND (SELECT COALESCE(SUM(py2.amount), 0) FROM payments py2 WHERE py2.invoice_id = i.id) > i.amount
              AND EXISTS (
                  SELECT 1 FROM invoices i2
                  WHERE i2.tenant_id = ? AND i2.status IN ('Unpaid', 'Overdue', 'Partial')
              )
            ORDER BY py.created_at DESC
        `).all(tenantId, tenantId);

        const totalCredit = tenant.credit_balance;

        const unpaidCount = db.prepare(`
            SELECT COUNT(*) AS count,
                   COALESCE(SUM(i.amount - COALESCE((SELECT SUM(py.amount) FROM payments py WHERE py.invoice_id = i.id), 0)), 0) AS totalDue
            FROM invoices i
            WHERE i.tenant_id = ? AND i.status IN ('Unpaid', 'Overdue', 'Partial')
        `).get(tenantId);

        return res.status(200).json({
            success: true,
            data: {
                tenantId: tenant.id,
                tenantName: tenant.full_name,
                totalCredit,
                unpaidInvoices: unpaidCount.count,
                totalDue: unpaidCount.totalDue,
                overpayments,
            },
        });

    } catch (error) {
        next(error);
    }
}

function undoPayment(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const paymentId = parseInt(req.params.id, 10);

        if (isNaN(paymentId)) {
            return res.status(400).json({ success: false, message: 'معرف الدفعة غير صالح.' });
        }

        const payment = db.prepare(`
            SELECT py.id, py.invoice_id, py.amount, py.payment_date, py.payment_method,
                   i.amount AS invoiceAmount, i.status AS invoiceStatus, i.notes AS invoiceNotes,
                   i.id AS invoiceId, i.tenant_id AS tenantId
            FROM payments py
            JOIN invoices i ON py.invoice_id = i.id
            JOIN tenants t ON i.tenant_id = t.id
            WHERE py.id = ? AND t.user_id = ?
        `).get(paymentId, userId);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على الدفعة.',
            });
        }

        const invoiceId = payment.invoiceId;
        const paymentAmount = payment.amount;

        // Calculate how much credit this payment contributed
        const totalPaidBefore = db.prepare(
            'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = ?'
        ).get(invoiceId).total;
        const creditBefore = Math.max(0, totalPaidBefore - payment.invoiceAmount);
        const totalPaidAfter = totalPaidBefore - paymentAmount;
        const creditAfter = Math.max(0, totalPaidAfter - payment.invoiceAmount);
        const creditContributed = creditBefore - creditAfter;

        const undoTransaction = db.transaction(() => {
            db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);

            if (creditContributed > 0) {
                db.prepare(`
                    UPDATE tenants SET credit_balance = MAX(0, credit_balance - ?),
                        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                    WHERE id = ?
                `).run(creditContributed, payment.tenantId);
            }

            const totalPaid = db.prepare(
                'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = ?'
            ).get(invoiceId).total;

            let newStatus;
            let newNotes = null;
            const remainingDue = payment.invoiceAmount - totalPaid;

            if (totalPaid >= payment.invoiceAmount) {
                newStatus = 'Paid';
                const credit = totalPaid - payment.invoiceAmount;
                if (credit > 0) {
                    newNotes = `زيادة مدفوعة: ${credit.toFixed(2)} ريال كرصيد دائن للمستأجر. يمكن استخدام هذا الرصيد في الفواتير القادمة.`;
                }
            } else if (totalPaid > 0) {
                newStatus = 'Partial';
            } else {
                newStatus = 'Unpaid';
            }

            db.prepare(`
                UPDATE invoices SET status = ?, notes = ?,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                WHERE id = ?
            `).run(newStatus, newNotes, invoiceId);

            return { newStatus, totalPaid, remainingDue: Math.max(0, remainingDue) };
        });

        const result = undoTransaction();

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, details, created_at)
            VALUES (?, 'UNDO_PAYMENT', ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, paymentId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown',
               JSON.stringify({
                   paymentId,
                   invoiceId,
                   amount: paymentAmount,
                   newStatus: result.newStatus,
               }));

        const statusLabels = {
            Paid: 'مدفوعة بالكامل',
            Partial: 'مدفوعة جزئياً',
            Overdue: 'متأخرة',
            Unpaid: 'غير مدفوعة',
            Cancelled: 'ملغاة',
        };

        return res.status(200).json({
            success: true,
            message: `✓ تم التراجع عن الدفعة بنجاح. حالة الفاتورة: ${statusLabels[result.newStatus]}.`,
            data: {
                payment: { id: paymentId, amount: paymentAmount },
                invoice: {
                    id: invoiceId,
                    status: result.newStatus,
                    totalPaid: result.totalPaid,
                    balanceDue: result.remainingDue,
                },
            },
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    recordPayment,
    listPayments,
    getTenantCredit,
    undoPayment,
};
