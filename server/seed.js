#!/usr/bin/env node
// =============================================================================
// File: seed.js
// Project: Uqari (عقاري) – PMS Backend
// Description: Standalone database seed script using better-sqlite3.
// Cleans all existing data (respecting CASCADE), then inserts a default
// landlord account, realistic properties, units, tenants, contracts with
// immediate invoices, mock payments, and sample expenses & maintenance tickets.
//
// Usage: node seed.js
// =============================================================================

'use strict';

const path = require('path');
const bcrypt = require('bcrypt');

// ── Initialize database schema ────────────────────────────────────────────
const { initializeDatabase, getDatabase } = require('./database');
initializeDatabase();

// ── Configuration ──────────────────────────────────────────────────────────
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'pms_database.db');

const LANDLORD_EMAIL = 'ahmed@example.com';
const LANDLORD_PASSWORD = 'secret123';
const LANDLORD_NAME = 'أحمد محمد';
const SALT_ROUNDS = 12;

console.log('='.repeat(60));
console.log('  Uqari (عقاري) – Database Seed Script');
console.log('='.repeat(60));
console.log(`  Database: ${DB_PATH}`);
console.log('');

// ── Use shared database instance ──────────────────────────────────────────
const db = getDatabase();

// ───────────────────────────────────────────────────────────────────────────
// 1. CLEAN EXISTING DATA (order respects foreign key constraints)
// ───────────────────────────────────────────────────────────────────────────
console.log('[1/5] تنظيف البيانات القديمة...');

db.exec(`
    DELETE FROM payments;
    DELETE FROM invoices;
    DELETE FROM maintenance_tickets;
    DELETE FROM expenses;
    DELETE FROM contracts;
    DELETE FROM tenants;
    DELETE FROM units;
    DELETE FROM properties;
    DELETE FROM settings;
    DELETE FROM audit_log;
    DELETE FROM users;
`);

console.log('      تم مسح جميع البيانات القديمة بنجاح.');

// ───────────────────────────────────────────────────────────────────────────
// 2. CREATE DEFAULT LANDLORD USER
// ───────────────────────────────────────────────────────────────────────────
console.log('[2/5] إنشاء حساب المالك...');

const passwordHash = bcrypt.hashSync(LANDLORD_PASSWORD, SALT_ROUNDS);

const userResult = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, 'landlord', 1,
            '2026-01-01T08:00:00Z',
            '2026-06-01T10:00:00Z')
`).run(LANDLORD_NAME, LANDLORD_EMAIL, passwordHash);

const landlordId = userResult.lastInsertRowid;
console.log(`      تم إنشاء حساب المالك: ${LANDLORD_EMAIL} / ${LANDLORD_PASSWORD}`);

// ── Insert default settings ────────────────────────────────────────────────
const insertSetting = db.prepare(`
    INSERT INTO settings (user_id, key, value, created_at, updated_at)
    VALUES (?, ?, ?,
            '2026-01-01T08:00:00Z',
            '2026-01-01T08:00:00Z')
`);

const defaultSettings = [
    ['currency', 'SAR'],
    ['billingDay', '1'],
    ['dueDay', '5'],
    ['fontSize', 'extraLarge'],
    ['pinEnabled', 'false'],
];

for (const [key, value] of defaultSettings) {
    insertSetting.run(landlordId, key, value);
}

console.log('      تم تعيين الإعدادات الافتراضية.');

// ───────────────────────────────────────────────────────────────────────────
// 3. CREATE PROPERTIES & UNITS
// ───────────────────────────────────────────────────────────────────────────
console.log('[3/5] إنشاء العقارات والوحدات...');

const insertProperty = db.prepare(`
    INSERT INTO properties (user_id, name, city, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?,
            '2026-01-15T08:00:00Z',
            '2026-01-15T08:00:00Z')
`);

const insertUnit = db.prepare(`
    INSERT INTO units (property_id, unit_number, type, floor, monthly_rent, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?,
            '2026-01-15T08:00:00Z',
            '2026-01-15T08:00:00Z')
`);

// Property 1: Residential building
const prop1Result = insertProperty.run(landlordId, 'عمارة الملك فهد', 'الرياض - حي النزهة', 'عمارة سكنية مكونة من 4 طوابق');
const prop1Id = prop1Result.lastInsertRowid;

insertUnit.run(prop1Id, '101', 'Apartment', 1, 2500, 'Occupied');
insertUnit.run(prop1Id, '102', 'Apartment', 1, 2200, 'Occupied');
insertUnit.run(prop1Id, '201', 'Apartment', 2, 3000, 'Occupied');
insertUnit.run(prop1Id, '202', 'Apartment', 2, 2800, 'Occupied');
insertUnit.run(prop1Id, '301', 'Apartment', 3, 3500, 'Vacant');
insertUnit.run(prop1Id, '302', 'Apartment', 3, 3200, 'UnderMaintenance');

// Property 2: Commercial building
const prop2Result = insertProperty.run(landlordId, 'مركز التسوق الحديث', 'جدة - حي الروضة', 'مركز تجاري صغير');
const prop2Id = prop2Result.lastInsertRowid;

insertUnit.run(prop2Id, 'محل 1', 'Shop', 1, 5000, 'Occupied');
insertUnit.run(prop2Id, 'محل 2', 'Shop', 1, 4500, 'Occupied');
insertUnit.run(prop2Id, 'محل 3', 'Shop', 2, 4000, 'Vacant');
insertUnit.run(prop2Id, 'مكتب 1', 'Room', 2, 3000, 'Occupied');

// Property 3: Small villa complex
const prop3Result = insertProperty.run(landlordId, 'استراحة النخيل', 'الدمام - حي الشاطئ', 'فيلات للإيجار الموسمي');
const prop3Id = prop3Result.lastInsertRowid;

insertUnit.run(prop3Id, 'فيلا أ', 'Villa', 1, 8000, 'Occupied');
insertUnit.run(prop3Id, 'فيلا ب', 'Villa', 1, 7500, 'Occupied');
insertUnit.run(prop3Id, 'فيلا ج', 'Villa', 1, 7000, 'Vacant');
insertUnit.run(prop3Id, 'استوديو 1', 'Studio', 1, 2000, 'Occupied');
insertUnit.run(prop3Id, 'استوديو 2', 'Studio', 1, 1800, 'Vacant');

console.log('      تم إنشاء 3 عقارات بـ 15 وحدة.');

// ───────────────────────────────────────────────────────────────────────────
// 4. CREATE TENANTS, CONTRACTS, INVOICES & PAYMENTS
// ───────────────────────────────────────────────────────────────────────────
console.log('[4/5] إنشاء المستأجرين والعقود والفواتير...');

// Get unit IDs for occupied units
const units = db.prepare('SELECT id, unit_number, monthly_rent, property_id FROM units ORDER BY id').all();
const unitMap = {};
for (const u of units) {
    unitMap[u.unit_number] = u;
}

const insertTenant = db.prepare(`
    INSERT INTO tenants (user_id, full_name, phone, secondary_phone, national_id, notes, is_former, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?,
            '2026-01-20T08:00:00Z',
            '2026-01-20T08:00:00Z')
`);

const insertContract = db.prepare(`
    INSERT INTO contracts (tenant_id, unit_id, start_date, end_date, monthly_rent, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?,
            '2026-02-01T08:00:00Z',
            '2026-02-01T08:00:00Z')
`);

const insertInvoice = db.prepare(`
    INSERT INTO invoices (contract_id, unit_id, tenant_id, invoice_number,
                          billing_month, billing_year, amount, due_date, status, notes,
                          created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            '2026-02-01T08:00:00Z',
            '2026-02-01T08:00:00Z')
`);

const insertPayment = db.prepare(`
    INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes, created_at)
    VALUES (?, ?, ?, ?, ?,
            '2026-02-05T10:00:00Z')
`);

// ── Seed data: tenants and contracts ───────────────────────────────────────
const seedData = [
    // { tenant, unitNumber, startDate, endDate, monthlyRent, contractStatus }
    {
        tenant: { name: 'محمد عبدالله السالم', phone: '+966501234567', idNumber: '1012345678' },
        unitNumber: '101', startDate: '2026-02-01', monthlyRent: 2500, contractStatus: 'Active'
    },
    {
        tenant: { name: 'خالد فهد العتيبي', phone: '+966555432109', idNumber: '1098765432' },
        unitNumber: '102', startDate: '2026-03-01', monthlyRent: 2200, contractStatus: 'Active'
    },
    {
        tenant: { name: 'عبدالرحمن سعد القحطاني', phone: '+966508888777', idNumber: '1055555555' },
        unitNumber: '201', startDate: '2026-01-01', monthlyRent: 3000, contractStatus: 'Active'
    },
    {
        tenant: { name: 'فيصل عمر الزهراني', phone: '+966500111222', idNumber: '1033334444' },
        unitNumber: '202', startDate: '2026-04-01', monthlyRent: 2800, contractStatus: 'Active'
    },
    {
        tenant: { name: 'نواف إبراهيم الدوسري', phone: '+966550555666', idNumber: '1077778888' },
        unitNumber: 'محل 1', startDate: '2026-01-01', monthlyRent: 5000, contractStatus: 'Active'
    },
    {
        tenant: { name: 'ماجد عبدالعزيز الحربي', phone: '+966545678901', idNumber: '1022223333' },
        unitNumber: 'محل 2', startDate: '2026-02-01', monthlyRent: 4500, contractStatus: 'Active'
    },
    {
        tenant: { name: 'سلطان محمد المالكي', phone: '+966598765432', idNumber: '1066661111' },
        unitNumber: 'مكتب 1', startDate: '2026-03-01', monthlyRent: 3000, contractStatus: 'Active'
    },
    {
        tenant: { name: 'هاني عبدالله الشمري', phone: '+966530001122', idNumber: '1044445555' },
        unitNumber: 'فيلا أ', startDate: '2026-01-15', monthlyRent: 8000, contractStatus: 'Active'
    },
    {
        tenant: { name: 'بدر تركي المطيري', phone: '+966512345678', idNumber: '1088889999' },
        unitNumber: 'فيلا ب', startDate: '2026-04-01', monthlyRent: 7500, contractStatus: 'Active'
    },
    {
        tenant: { name: 'أيمن حسن الغامدي', phone: '+966577778888', idNumber: '1011112222' },
        unitNumber: 'استوديو 1', startDate: '2026-05-01', monthlyRent: 2000, contractStatus: 'Active'
    },
];

// Former tenant
const formerTenantResult = insertTenant.run(
    landlordId, 'سامي علي العنزي', '+966599990000', null, '1099990000',
    'مستأجر سابق - غادر في مارس 2026', 1
);
const formerTenantId = formerTenantResult.lastInsertRowid;

let invoiceSeq = 0;
const currentMonth = new Date().getUTCMonth() + 1;
const currentYear = new Date().getUTCFullYear();

for (const item of seedData) {
    const unit = unitMap[item.unitNumber];

    // Create tenant
    const tResult = insertTenant.run(
        landlordId,
        item.tenant.name,
        item.tenant.phone,
        null,
        item.tenant.idNumber,
        null,
        0
    );
    const tenantId = tResult.lastInsertRowid;

    // Create contract
    const cResult = insertContract.run(
        tenantId,
        unit.id,
        item.startDate,
        null,
        item.monthlyRent,
        item.contractStatus
    );
    const contractId = cResult.lastInsertRowid;

    // Generate invoices from start month to current month
    const startParts = item.startDate.split('-').map(Number);
    let sm = startParts[1];
    let sy = startParts[0];

    while (sy < currentYear || (sy === currentYear && sm <= currentMonth)) {
        invoiceSeq++;
        const invNum = `INV-${sy}-${String(sm).padStart(2, '0')}-${String(invoiceSeq).padStart(3, '0')}`;
        const dueDate = `${sy}-${String(sm).padStart(2, '0')}-05`;

        // Determine status based on date
        const now = new Date();
        const invoiceDate = new Date(sy, sm - 1, 5);
        let invStatus = 'Unpaid';
        if (invoiceDate < new Date(now.getFullYear(), now.getMonth(), 1)) {
            // Previous month: mark as paid
            invStatus = 'Paid';
        } else if (invoiceDate < now) {
            // This month but past due: mark as unpaid (or overdue if past 5th)
            if (now.getDate() > 5 && sm === now.getMonth() + 1 && sy === now.getFullYear()) {
                invStatus = 'Overdue';
            } else {
                invStatus = 'Unpaid';
            }
        } else {
            invStatus = 'Unpaid';
        }

        const iResult = insertInvoice.run(
            contractId, unit.id, tenantId, invNum,
            sm, sy, item.monthlyRent, dueDate, invStatus,
            invStatus === 'Paid' ? 'تم الدفع' : null
        );
        const invoiceId = iResult.lastInsertRowid;

        // Create mock payment for paid invoices
        if (invStatus === 'Paid') {
            insertPayment.run(invoiceId, item.monthlyRent, dueDate, 'BankTransfer', 'تحويل بنكي');
        }

        // Advance to next month
        sm++;
        if (sm > 12) {
            sm = 1;
            sy++;
        }
    }
}

console.log('      تم إنشاء 10 مستأجرين نشطين وعقودهم وفواتيرهم.');
console.log('      تم إنشاء مستأجر سابق واحد (سامي العنزي).');

// ───────────────────────────────────────────────────────────────────────────
// 5. CREATE SAMPLE EXPENSES & MAINTENANCE TICKETS
// ───────────────────────────────────────────────────────────────────────────
console.log('[5/5] إنشاء نماذج للمصروفات وتذاكر الصيانة...');

const insertExpense = db.prepare(`
    INSERT INTO expenses (user_id, property_id, unit_id, type, amount, date, description, receipt_image_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?,
            '2026-03-15T08:00:00Z',
            '2026-03-15T08:00:00Z')
`);

const insertTicket = db.prepare(`
    INSERT INTO maintenance_tickets (user_id, unit_id, reported_by, description, urgency, status, issue_image_path, resolved_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?,
            '2026-04-10T08:00:00Z',
            '2026-04-10T08:00:00Z')
`);

// Expenses
insertExpense.run(landlordId, prop1Id, unitMap['302'].id, 'Maintenance', 850, '2026-03-15', 'إصلاح تسريب مياه في الوحدة 302 - تغيير قطع السباكة', null);
insertExpense.run(landlordId, prop1Id, null, 'Utilities', 1200, '2026-04-01', 'فاتورة كهرباء العمارة - شهر مارس', null);
insertExpense.run(landlordId, prop1Id, null, 'Cleaning', 400, '2026-04-05', 'تنظيف المدخل والسلالم', null);
insertExpense.run(landlordId, prop2Id, null, 'MunicipalityFees', 2500, '2026-04-10', 'رسوم بلدية المركز التجاري - الربع الأول', null);
insertExpense.run(landlordId, prop3Id, unitMap['فيلا ج'].id, 'Repairs', 3200, '2026-05-20', 'دهان وتجديد فيلا ج - تحضير للمستأجر الجديد', null);
insertExpense.run(landlordId, prop1Id, null, 'Insurance', 1800, '2026-01-10', 'تأمين الممتلكات السنوي', null);

// Maintenance tickets
insertTicket.run(landlordId, unitMap['302'].id, 'المالك', 'تسريب مياه من السقف في الحمام الرئيسي. يحتاج سباك بشكل عاجل.', 'High', 'Resolved', null, '2026-03-18');
insertTicket.run(landlordId, unitMap['201'].id, 'عبدالرحمن سعد القحطاني', 'مكيف الغرفة الرئيسية لا يعمل. التكييف قديم ويحتاج صيانة أو استبدال.', 'Medium', 'InProgress', null, null);
insertTicket.run(landlordId, unitMap['محل 2'].id, 'ماجد عبدالعزيز الحربي', 'قفل باب المحل مكسور. لا يمكن إغلاق المحل بشكل آمن.', 'Emergency', 'Open', null, null);
insertTicket.run(landlordId, unitMap['302'].id, 'المالك', 'تجديد الوحدة بالكامل قبل التأجير (دهان - سباكة - كهرباء)', 'Low', 'Open', null, null);

console.log('      تم إنشاء 6 مصروفات و 4 تذاكر صيانة.');
console.log('');
console.log('='.repeat(60));
console.log('  تم الانتهاء من تجهيز بيانات الاختبار بنجاح!');
console.log('='.repeat(60));
console.log('');
console.log('  بيانات الدخول:');
console.log(`    البريد: ${LANDLORD_EMAIL}`);
console.log(`    كلمة المرور: ${LANDLORD_PASSWORD}`);
console.log('');
console.log('  ملخص البيانات:');
console.log('    الملاك: 1');
console.log('    العقارات: 3');
console.log('    الوحدات: 15');
console.log('    المستأجرون النشطون: 10');
console.log('    المستأجرون السابقون: 1');
console.log('    العقود النشطة: 10');
console.log('    الفواتير: ~50');
console.log('    المصروفات: 6');
console.log('    تذاكر الصيانة: 4');
console.log('');

// ── Close database ─────────────────────────────────────────────────────────
const { closeDatabase } = require('./database');
closeDatabase();
