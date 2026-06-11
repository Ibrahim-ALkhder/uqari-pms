// =============================================================================
// File: controllers/contractController.js
// Project: Uqari (عقاري) – PMS Backend
// Description: Handlers for /api/contracts endpoints.
// POST /api/contracts activates a contract AND immediately generates the
// first month's invoice row for instantaneous visibility.
// All user-facing messages are in clear, polite Arabic.
// =============================================================================

'use strict';

const { getDatabase } = require('../database');
const { paginate, paginatedResponse } = require('../helpers/pagination');

// ────────────────────────────────────────────────────────────────────────────
// POST /api/contracts
// Creates a new rental contract between a tenant and a unit.
// Automatically:
//   1. Validates the tenant exists and is not a former tenant.
//   2. Validates the unit exists and is vacant.
//   3. Updates the unit status to 'Occupied'.
//   4. Creates the contract record.
//   5. Generates the FIRST MONTH's invoice immediately.
// This guarantees the landlord sees an invoice on the dashboard right away.
// ────────────────────────────────────────────────────────────────────────────
function createContract(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { tenantId, unitId, startDate, monthlyRent, endDate } = req.body;

        // ─────────────────────────────────────────────────────────────────
        // STEP 1: Validate input fields
        // ─────────────────────────────────────────────────────────────────
        const errors = [];

        const parsedTenantId = parseInt(tenantId, 10);
        if (!tenantId || isNaN(parsedTenantId)) {
            errors.push({ field: 'tenantId', message: 'معرف المستأجر مطلوب.' });
        }

        const parsedUnitId = parseInt(unitId, 10);
        if (!unitId || isNaN(parsedUnitId)) {
            errors.push({ field: 'unitId', message: 'معرف الوحدة مطلوب.' });
        }

        if (!startDate || typeof startDate !== 'string') {
            errors.push({ field: 'startDate', message: 'تاريخ بداية العقد مطلوب.' });
        } else {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(startDate)) {
                errors.push({ field: 'startDate', message: 'صيغة التاريخ غير صحيحة. يجب أن تكون YYYY-MM-DD.' });
            }
        }

        const parsedMonthlyRent = monthlyRent !== undefined && monthlyRent !== '' && monthlyRent !== null ? parseFloat(monthlyRent) : undefined;
        if (monthlyRent === undefined || monthlyRent === null || monthlyRent === '' || isNaN(parsedMonthlyRent)) {
            errors.push({ field: 'monthlyRent', message: 'قيمة الإيجار الشهري مطلوبة.' });
        } else if (parsedMonthlyRent <= 0 || parsedMonthlyRent > 999999999) {
            errors.push({ field: 'monthlyRent', message: 'الإيجار الشهري يجب أن يكون أكبر من صفر وأقل من 999,999,999.' });
        }

        if (endDate && typeof endDate === 'string') {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(endDate)) {
                errors.push({ field: 'endDate', message: 'صيغة تاريخ الانتهاء غير صحيحة.' });
            } else if (startDate && endDate < startDate) {
                errors.push({ field: 'endDate', message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.' });
            }
        }

        if (errors.length > 0) {
            return res.status(422).json({
                success: false,
                message: 'يرجى تصحيح الأخطاء التالية:',
                errors,
            });
        }

        // ─────────────────────────────────────────────────────────────────
        // STEP 2: Verify tenant exists, belongs to user, and is not former
        // ─────────────────────────────────────────────────────────────────
        const tenant = db.prepare(`
            SELECT id, full_name, is_former FROM tenants WHERE id = ? AND user_id = ?
        `).get(parsedTenantId, userId);

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على المستأجر المحدد.',
            });
        }

        if (tenant.is_former === 1) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن إنشاء عقد لمستأجر سابق. يرجى إعادة تسجيل المستأجر أولاً.',
            });
        }

        // ─────────────────────────────────────────────────────────────────
        // STEP 3: Verify unit exists, belongs to user, and is vacant
        // ─────────────────────────────────────────────────────────────────
        const unit = db.prepare(`
            SELECT u.id, u.unit_number, u.status, u.monthly_rent, p.name AS property_name
            FROM units u
            JOIN properties p ON u.property_id = p.id
            WHERE u.id = ? AND p.user_id = ?
        `).get(parsedUnitId, userId);

        if (!unit) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على الوحدة المحددة.',
            });
        }

        if (unit.status !== 'Vacant') {
            const statusMap = { Occupied: 'مؤجرة حالياً', UnderMaintenance: 'تحت الصيانة' };
            return res.status(409).json({
                success: false,
                message: `الوحدة ${unit.unit_number} غير متاحة للتأجير. حالتها: ${statusMap[unit.status] || unit.status}.`,
            });
        }

        // ─────────────────────────────────────────────────────────────────
        // STEP 4: Check if tenant already has an active contract elsewhere
        // ─────────────────────────────────────────────────────────────────
        const existingActive = db.prepare(`
            SELECT c.id, u.unit_number FROM contracts c
            JOIN units u ON c.unit_id = u.id
            WHERE c.tenant_id = ? AND c.status = 'Active'
            LIMIT 1
        `).get(parsedTenantId);

        if (existingActive) {
            return res.status(409).json({
                success: false,
                message: `المستأجر لديه بالفعل عقد نشط على الوحدة ${existingActive.unit_number}. يرجى إنهاء العقد الحالي أولاً.`,
            });
        }

        // ─────────────────────────────────────────────────────────────────
        // STEP 5: Calculate due date based on user settings
        // ─────────────────────────────────────────────────────────────────
        const dueDaySetting = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'dueDay'").get(userId);
        const dueDay = dueDaySetting ? parseInt(dueDaySetting.value, 10) : 5;

        // Calculate the billing period from startDate
        const startDateObj = new Date(startDate + 'T00:00:00Z');
        const billingMonth = startDateObj.getUTCMonth() + 1;
        const billingYear = startDateObj.getUTCFullYear();

        // Calculate the due date: use dueDay from settings, clamped to month length
        const daysInMonth = new Date(billingYear, billingMonth, 0).getDate();
        const safeDueDay = Math.min(dueDay, daysInMonth);
        const dueDateStr = `${billingYear}-${String(billingMonth).padStart(2, '0')}-${String(safeDueDay).padStart(2, '0')}`;

        // Generate invoice number sequence
        const seqResult = db.prepare(`
            SELECT COALESCE(COUNT(*), 0) + 1 AS seq
            FROM invoices WHERE billing_month = ? AND billing_year = ?
        `).get(billingMonth, billingYear);

        const seq = String(seqResult.seq).padStart(3, '0');
        const invoiceNumber = `INV-${billingYear}-${String(billingMonth).padStart(2, '0')}-${seq}`;

        const finalRent = parsedMonthlyRent;

        // ─────────────────────────────────────────────────────────────────
        // STEP 6: Execute the entire contract activation in a transaction
        // ─────────────────────────────────────────────────────────────────
        const createContractTransaction = db.transaction(() => {

            // 6a. Update unit status to Occupied
            db.prepare(`
                UPDATE units SET status = 'Occupied', monthly_rent = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                WHERE id = ?
            `).run(finalRent, parsedUnitId);

            // 6b. Insert the contract
            const contractResult = db.prepare(`
                INSERT INTO contracts (tenant_id, unit_id, start_date, end_date, monthly_rent, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'Active',
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            `).run(parsedTenantId, parsedUnitId, startDate, endDate || null, finalRent);

            const contractId = contractResult.lastInsertRowid;

            // 6c. Generate the FIRST MONTH's invoice immediately
            const invoiceResult = db.prepare(`
                INSERT INTO invoices (contract_id, unit_id, tenant_id, invoice_number,
                                      billing_month, billing_year, amount, due_date, status,
                                      created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Unpaid',
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            `).run(contractId, parsedUnitId, parsedTenantId, invoiceNumber,
                   billingMonth, billingYear, finalRent, dueDateStr);

            const invoiceId = invoiceResult.lastInsertRowid;

            return { contractId, invoiceId };
        });

        const { contractId, invoiceId } = createContractTransaction();

        // ── Log audit ──────────────────────────────────────────────────────
        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, details, created_at)
            VALUES (?, 'ADD_CONTRACT', ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, contractId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown',
               JSON.stringify({ tenantId: parsedTenantId, unitId: parsedUnitId, monthlyRent: finalRent }));

        return res.status(201).json({
            success: true,
            message: 'تم تفعيل عقد الإيجار بنجاح. تم إنشاء العقد وتوليد فاتورة الشهر الأول تلقائياً.',
            data: {
                contract: {
                    id: contractId,
                    tenantId: parsedTenantId,
                    tenantName: tenant.full_name,
                    unitId: parsedUnitId,
                    unitNumber: unit.unit_number,
                    propertyName: unit.property_name,
                    startDate: startDate,
                    endDate: endDate || null,
                    monthlyRent: finalRent,
                    status: 'Active',
                },
                invoice: {
                    id: invoiceId,
                    invoiceNumber: invoiceNumber,
                    billingMonth: billingMonth,
                    billingYear: billingYear,
                    amount: finalRent,
                    dueDate: dueDateStr,
                    status: 'Unpaid',
                },
            },
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/contracts
// List all contracts for the authenticated user.
// Supports optional filter: ?status=Active|Expired|Terminated
// ────────────────────────────────────────────────────────────────────────────
function listContracts(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { status, tenantId, unitId, page, limit } = req.query;

        let whereClause = '';
        const params = [userId];

        if (status) {
            const validStatuses = ['Active', 'Expired', 'Terminated'];
            if (validStatuses.includes(status)) {
                whereClause += ' AND c.status = ?';
                params.push(status);
            }
        }

        if (tenantId) {
            const parsed = parseInt(tenantId, 10);
            if (!isNaN(parsed)) {
                whereClause += ' AND c.tenant_id = ?';
                params.push(parsed);
            }
        }

        if (unitId) {
            const parsed = parseInt(unitId, 10);
            if (!isNaN(parsed)) {
                whereClause += ' AND c.unit_id = ?';
                params.push(parsed);
            }
        }

        const total = db.prepare(`
            SELECT COUNT(*) AS count
            FROM contracts c
            JOIN tenants t ON c.tenant_id = t.id
            WHERE t.user_id = ?${whereClause}
        `).get(...params).count;

        const { data, pagination } = paginate(
            (args) => db.prepare(`
                SELECT
                    c.id,
                    c.tenant_id AS tenantId,
                    t.full_name AS tenantName,
                    t.phone AS tenantPhone,
                    c.unit_id AS unitId,
                    u.unit_number AS unitNumber,
                    p.name AS propertyName,
                    c.start_date AS startDate,
                    c.end_date AS endDate,
                    c.monthly_rent AS monthlyRent,
                    c.status,
                    c.created_at AS createdAt,
                    c.updated_at AS updatedAt
                FROM contracts c
                JOIN tenants t ON c.tenant_id = t.id
                JOIN units u ON c.unit_id = u.id
                JOIN properties p ON u.property_id = p.id
                WHERE t.user_id = ?${whereClause}
                ORDER BY c.created_at DESC
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
// GET /api/contracts/:id
// Get a single contract with its full invoice history.
// ────────────────────────────────────────────────────────────────────────────
function getContract(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const contractId = parseInt(req.params.id, 10);

        if (isNaN(contractId)) {
            return res.status(400).json({ success: false, message: 'معرف العقد غير صالح.' });
        }

        const contract = db.prepare(`
            SELECT
                c.id,
                c.tenant_id AS tenantId,
                t.full_name AS tenantName,
                t.phone AS tenantPhone,
                c.unit_id AS unitId,
                u.unit_number AS unitNumber,
                p.name AS propertyName,
                c.start_date AS startDate,
                c.end_date AS endDate,
                c.monthly_rent AS monthlyRent,
                c.status,
                c.created_at AS createdAt,
                c.updated_at AS updatedAt
            FROM contracts c
            JOIN tenants t ON c.tenant_id = t.id
            JOIN units u ON c.unit_id = u.id
            JOIN properties p ON u.property_id = p.id
            WHERE c.id = ? AND t.user_id = ?
        `).get(contractId, userId);

        if (!contract) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على العقد.',
            });
        }

        const invoices = db.prepare(`
            SELECT
                i.id,
                i.invoice_number AS invoiceNumber,
                i.billing_month AS billingMonth,
                i.billing_year AS billingYear,
                i.amount,
                i.due_date AS dueDate,
                i.status,
                i.notes,
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paidAmount,
                i.created_at AS createdAt
            FROM invoices i
            WHERE i.contract_id = ?
            ORDER BY i.billing_year DESC, i.billing_month DESC
        `).all(contractId);

        return res.status(200).json({
            success: true,
            data: {
                ...contract,
                invoices,
            },
        });

    } catch (error) {
        next(error);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/contracts/:id/terminate
// Terminate an active contract. Updates unit to Vacant.
// ────────────────────────────────────────────────────────────────────────────
function terminateContract(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const contractId = parseInt(req.params.id, 10);

        if (isNaN(contractId)) {
            return res.status(400).json({ success: false, message: 'معرف العقد غير صالح.' });
        }

        const { terminationDate, reason } = req.body;

        if (!terminationDate || typeof terminationDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(terminationDate)) {
            return res.status(422).json({
                success: false,
                message: 'تاريخ إنهاء العقد مطلوب ويجب أن يكون بصيغة YYYY-MM-DD.',
                errors: [{ field: 'terminationDate', message: 'صيغة التاريخ غير صحيحة.' }],
            });
        }

        const contract = db.prepare(`
            SELECT c.id, c.status, c.unit_id, c.tenant_id, c.start_date, t.full_name AS tenantName
            FROM contracts c
            JOIN tenants t ON c.tenant_id = t.id
            WHERE c.id = ? AND t.user_id = ?
        `).get(contractId, userId);

        if (!contract) {
            return res.status(404).json({
                success: false,
                message: 'عذراً، لم يتم العثور على العقد.',
            });
        }

        if (contract.status !== 'Active') {
            return res.status(400).json({
                success: false,
                message: 'العقد غير نشط أو منتهي بالفعل.',
            });
        }

        if (terminationDate < contract.start_date) {
            return res.status(422).json({
                success: false,
                message: 'تاريخ الإنتهاء يجب أن يكون بعد تاريخ بداية العقد.',
            });
        }

        // Check for unpaid invoices
        const unpaidInvoices = db.prepare(`
            SELECT COUNT(*) AS count, COALESCE(SUM(i.amount - COALESCE((
                SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id
            ), 0)), 0) AS totalDue
            FROM invoices i
            WHERE i.contract_id = ? AND i.status IN ('Unpaid', 'Overdue', 'Partial')
        `).get(contractId);

        let warningMessage = null;
        if (unpaidInvoices.count > 0) {
            warningMessage = `يوجد ${unpaidInvoices.count} فاتورة غير مدفوعة بقيمة ${unpaidInvoices.totalDue.toFixed(2)} ريال. سيتم إنهاء العقد مع بقاء الفواتير غير مدفوعة.`;
        }

        // Execute termination in transaction
        const terminateTransaction = db.transaction(() => {
            db.prepare(`
                UPDATE contracts SET status = 'Terminated', end_date = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                WHERE id = ?
            `).run(terminationDate, contractId);

            db.prepare(`
                UPDATE units SET status = 'Vacant', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                WHERE id = ?
            `).run(contract.unit_id);
        });

        terminateTransaction();

        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, details, created_at)
            VALUES (?, 'TERMINATE_CONTRACT', ?, ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, contractId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown',
               JSON.stringify({ reason: reason || null, terminationDate }));

        const responseData = {
            contractId: contract.id,
            status: 'Terminated',
            endDate: terminationDate,
            unitStatus: 'Vacant',
        };

        const responseMessage = 'تم إنهاء العقد وتحرير الوحدة بنجاح. الوحدة الآن شاغرة.';

        if (warningMessage) {
            return res.status(200).json({
                success: true,
                warning: warningMessage,
                message: responseMessage,
                data: responseData,
            });
        }

        return res.status(200).json({
            success: true,
            message: responseMessage,
            data: responseData,
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    createContract,
    listContracts,
    getContract,
    terminateContract,
};
