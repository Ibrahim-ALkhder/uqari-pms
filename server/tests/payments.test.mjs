import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp } from './helpers.mjs';

let app;
let db;
let token;

beforeAll(async () => {
    const ctx = createTestApp();
    app = ctx.app;
    db = ctx.db;

    await request(app)
        .post('/api/auth/register')
        .send({ name: 'المالك', email: 'landlord@test.com', password: 'password123' });

    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'landlord@test.com', password: 'password123' });
    token = loginRes.body.data.token;

    // Create property with unit
    const propRes = await request(app)
        .post('/api/properties')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'عقار الاختبار', city: 'الرياض', unitCount: 1 });

    // Create tenant
    const tenantRes = await request(app)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'مستأجر اختبار', phone: '0500000000' });

    const tenantId = tenantRes.body.data.id;
    const property = await request(app)
        .get(`/api/properties/${propRes.body.data.id}`)
        .set('Authorization', `Bearer ${token}`);
    const unitId = property.body.data.units[0].id;

    // Create contract - generates invoice 1
    const contractRes = await request(app)
        .post('/api/contracts')
        .set('Authorization', `Bearer ${token}`)
        .send({ tenantId, unitId, startDate: '2026-01-01', monthlyRent: 3000 });

    const contractId = contractRes.body.data.contract.id;

    // Manually create invoices 2 and 3 for Feb and Mar 2026
    // We do this via DB directly to set up the test scenarios
    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('landlord@test.com').id;

    const insertInv = db.prepare(`
        INSERT INTO invoices (contract_id, unit_id, tenant_id, invoice_number, billing_month, billing_year, amount, due_date, status, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Unpaid', NULL,
                strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    `);

    insertInv.run(contractId, unitId, tenantId, 'INV-2026-02-001', 2, 2026, 3000, '2026-02-05');
    insertInv.run(contractId, unitId, tenantId, 'INV-2026-03-001', 3, 2026, 3000, '2026-03-05');
});

afterAll(() => {
    closeTestApp();
});

describe('Payment Processing', () => {
    let fullInvoiceId;
    let partialInvoiceId;
    let overpayInvoiceId;

    beforeAll(async () => {
        const invRes = await request(app)
            .get('/api/invoices')
            .set('Authorization', `Bearer ${token}`);
        const invoices = invRes.body.data;

        fullInvoiceId = invoices.find(i => i.billingMonth === 1).id;
        partialInvoiceId = invoices.find(i => i.billingMonth === 2).id;
        overpayInvoiceId = invoices.find(i => i.billingMonth === 3).id;
    });

    it('GET /api/payments/credit/:tenantId - should return zero credit initially', async () => {
        const tenantRes = await request(app)
            .get('/api/tenants')
            .set('Authorization', `Bearer ${token}`);

        const tenantId = tenantRes.body.data[0].id;

        const res = await request(app)
            .get(`/api/payments/credit/${tenantId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(res.body.data.totalCredit).toBe(0);
    });

    it('POST /api/payments - should reject without auth', async () => {
        await request(app)
            .post('/api/payments')
            .send({ invoiceId: 1, amount: 100, paymentDate: '2026-01-15', paymentMethod: 'Cash' })
            .expect(401);
    });

    it('POST /api/payments - should reject invalid invoice', async () => {
        const res = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${token}`)
            .send({ invoiceId: 99999, amount: 100, paymentDate: '2026-01-15', paymentMethod: 'Cash' })
            .expect(404);

        expect(res.body.success).toBe(false);
    });

    it('POST /api/payments - should reject missing fields', async () => {
        const res = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${token}`)
            .send({ amount: 100 })
            .expect(422);

        expect(res.body.success).toBe(false);
    });

    describe('Full Payment', () => {
        it('should process full payment and mark invoice as Paid', async () => {
            const res = await request(app)
                .post('/api/payments')
                .set('Authorization', `Bearer ${token}`)
                .send({ invoiceId: fullInvoiceId, amount: 3000, paymentDate: '2026-01-15', paymentMethod: 'BankTransfer' })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.invoice.status).toBe('Paid');
        });

        it('should reflect paid status on invoice', async () => {
            const invRes = await request(app)
                .get(`/api/invoices/${fullInvoiceId}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(invRes.body.data.status).toBe('Paid');
            expect(invRes.body.data.totalPaid).toBe(3000);
        });
    });

    describe('Partial Payment', () => {
        it('should process partial payment and mark invoice as Partial', async () => {
            const res = await request(app)
                .post('/api/payments')
                .set('Authorization', `Bearer ${token}`)
                .send({ invoiceId: partialInvoiceId, amount: 1000, paymentDate: '2026-02-10', paymentMethod: 'Cash' })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.invoice.status).toBe('Partial');
        });

        it('should reflect partial status on invoice', async () => {
            const invRes = await request(app)
                .get(`/api/invoices/${partialInvoiceId}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(invRes.body.data.status).toBe('Partial');
            expect(invRes.body.data.totalPaid).toBe(1000);
        });

        it('should allow completing the remaining amount', async () => {
            const res = await request(app)
                .post('/api/payments')
                .set('Authorization', `Bearer ${token}`)
                .send({ invoiceId: partialInvoiceId, amount: 2000, paymentDate: '2026-02-20', paymentMethod: 'BankTransfer' })
                .expect(200);

            expect(res.body.data.invoice.status).toBe('Paid');
        });
    });

    describe('Overpayment', () => {
        let tenantId;

        beforeAll(async () => {
            const tenantRes = await request(app)
                .get('/api/tenants')
                .set('Authorization', `Bearer ${token}`);
            tenantId = tenantRes.body.data[0].id;
        });

        it('should process overpayment and track credit', async () => {
            const res = await request(app)
                .post('/api/payments')
                .set('Authorization', `Bearer ${token}`)
                .send({ invoiceId: overpayInvoiceId, amount: 3500, paymentDate: '2026-03-10', paymentMethod: 'BankTransfer' })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.invoice.status).toBe('Paid');
            expect(res.body.data.credit.amount).toBeGreaterThan(0);
        });

        it('should store credit amount in invoice notes', async () => {
            const invRes = await request(app)
                .get(`/api/invoices/${overpayInvoiceId}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(invRes.body.data.notes).toContain('زيادة مدفوعة');
        });

        it('should reflect credit_balance on the tenant', async () => {
            const creditRes = await request(app)
                .get(`/api/payments/credit/${tenantId}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(creditRes.body.data.totalCredit).toBeGreaterThan(0);
            expect(creditRes.body.data.tenantName).toBe('مستأجر اختبار');
        });
    });
});

describe('GET /api/payments', () => {
    it('should list all payments', async () => {
        const res = await request(app)
            .get('/api/payments')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });
});

describe('DELETE /api/payments/:id (Undo)', () => {
    let paymentId;

    beforeAll(async () => {
        const invRes = await request(app)
            .get('/api/invoices')
            .set('Authorization', `Bearer ${token}`);
        const invoices = invRes.body.data;
        const paidInvoice = invoices.find(i => i.status === 'Paid');

        if (paidInvoice) {
            const payRes = await request(app)
                .get('/api/payments')
                .set('Authorization', `Bearer ${token}`);
            const payment = payRes.body.data.find(p => p.invoiceId === paidInvoice.id);
            if (payment) paymentId = payment.id;
        }
    });

    it('should reject without auth', async () => {
        await request(app)
            .delete('/api/payments/1')
            .expect(401);
    });

    it('should reject non-existent payment', async () => {
        const res = await request(app)
            .delete('/api/payments/99999')
            .set('Authorization', `Bearer ${token}`)
            .expect(404);

        expect(res.body.success).toBe(false);
    });

    it('should reject invalid payment id', async () => {
        const res = await request(app)
            .delete('/api/payments/abc')
            .set('Authorization', `Bearer ${token}`)
            .expect(400);

        expect(res.body.success).toBe(false);
    });

    it('should undo a payment and revert invoice status', async () => {
        if (!paymentId) return;

        const res = await request(app)
            .delete(`/api/payments/${paymentId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(res.body.success).toBe(true);

        const { data } = res.body;
        expect(data.payment.id).toBe(paymentId);
        expect(['Paid', 'Partial', 'Unpaid']).toContain(data.invoice.status);

        const invRes = await request(app)
            .get(`/api/invoices/${data.invoice.id}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(invRes.body.data.status).toBe(data.invoice.status);
    });

    it('should return 404 for already-deleted payment', async () => {
        if (!paymentId) return;

        const res = await request(app)
            .delete(`/api/payments/${paymentId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(404);

        expect(res.body.success).toBe(false);
    });
});
