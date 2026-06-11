// =============================================================================
// database.js – SQLite Database Initialization with better-sqlite3
// =============================================================================
// This module initializes the SQLite database connection, enforces required
// PRAGMAs, and programmatically creates all tables, indexes, and triggers.
// Executed once at server startup.
// =============================================================================

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'pms_database.db');

let db = null;

/**
 * Initializes the database connection, PRAGMAs, schema, indexes, and triggers.
 * Returns the database instance. Idempotent – safe to call multiple times.
 */
function initializeDatabase() {
    if (db) {
        return db;
    }

    // Open the database file (creates it if missing)
    db = new Database(DB_PATH);

    // ── PRAGMA Configuration ──────────────────────────────────────────────
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000');
    db.pragma('temp_store = MEMORY');

    // ── Create Tables ─────────────────────────────────────────────────────

    // 1. users
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT    NOT NULL,
            email           TEXT    NOT NULL UNIQUE,
            password_hash   TEXT    NOT NULL,
            pin_hash        TEXT    DEFAULT NULL,
            role            TEXT    NOT NULL DEFAULT 'landlord'
                                  CHECK (role IN ('landlord', 'admin', 'tenant')),
            is_active       INTEGER NOT NULL DEFAULT 1
                                  CHECK (is_active IN (0, 1)),
            created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
    `);

    // 2. properties
    db.exec(`
        CREATE TABLE IF NOT EXISTS properties (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL
                            REFERENCES users(id) ON DELETE CASCADE,
            name            TEXT    NOT NULL
                                  CHECK (length(name) >= 2 AND length(name) <= 100),
            city            TEXT    NOT NULL
                                  CHECK (length(city) >= 2 AND length(city) <= 100),
            notes           TEXT    DEFAULT NULL
                                  CHECK (notes IS NULL OR length(notes) <= 500),
            created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
    `);

    // 3. units
    db.exec(`
        CREATE TABLE IF NOT EXISTS units (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id     INTEGER NOT NULL
                            REFERENCES properties(id) ON DELETE CASCADE,
            unit_number     TEXT    NOT NULL
                                  CHECK (length(unit_number) >= 1 AND length(unit_number) <= 50),
            type            TEXT    NOT NULL DEFAULT 'Apartment'
                                  CHECK (type IN ('Apartment', 'Shop', 'Room', 'Villa', 'Studio')),
            floor           INTEGER DEFAULT NULL
                                  CHECK (floor IS NULL OR (floor >= 0 AND floor <= 200)),
            monthly_rent    REAL    NOT NULL DEFAULT 0
                                  CHECK (monthly_rent >= 0 AND monthly_rent <= 999999999),
            status          TEXT    NOT NULL DEFAULT 'Vacant'
                                  CHECK (status IN ('Vacant', 'Occupied', 'UnderMaintenance')),
            created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            UNIQUE (property_id, unit_number)
        );
    `);

    // 4. tenants
    db.exec(`
        CREATE TABLE IF NOT EXISTS tenants (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL
                            REFERENCES users(id) ON DELETE CASCADE,
            user_account_id INTEGER DEFAULT NULL
                            REFERENCES users(id) ON DELETE SET NULL,
            full_name       TEXT    NOT NULL
                                  CHECK (length(full_name) >= 2 AND length(full_name) <= 100),
            phone           TEXT    NOT NULL
                                  CHECK (length(phone) >= 7 AND length(phone) <= 20),
            secondary_phone TEXT    DEFAULT NULL
                                  CHECK (secondary_phone IS NULL OR (length(secondary_phone) >= 7 AND length(secondary_phone) <= 20)),
            national_id     TEXT    DEFAULT NULL
                                  CHECK (national_id IS NULL OR (length(national_id) >= 5 AND length(national_id) <= 20)),
            notes           TEXT    DEFAULT NULL
                                  CHECK (notes IS NULL OR length(notes) <= 500),
            is_former       INTEGER NOT NULL DEFAULT 0
                                  CHECK (is_former IN (0, 1)),
            created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
    `);

    // 5. contracts
    db.exec(`
        CREATE TABLE IF NOT EXISTS contracts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id       INTEGER NOT NULL
                            REFERENCES tenants(id) ON DELETE CASCADE,
            unit_id         INTEGER NOT NULL
                            REFERENCES units(id) ON DELETE CASCADE,
            start_date      TEXT    NOT NULL,
            end_date        TEXT    DEFAULT NULL,
            monthly_rent    REAL    NOT NULL
                                  CHECK (monthly_rent >= 0 AND monthly_rent <= 999999999),
            status          TEXT    NOT NULL DEFAULT 'Active'
                                  CHECK (status IN ('Active', 'Expired', 'Terminated')),
            created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
    `);

    // 6. invoices
    db.exec(`
        CREATE TABLE IF NOT EXISTS invoices (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id     INTEGER NOT NULL
                            REFERENCES contracts(id) ON DELETE CASCADE,
            unit_id         INTEGER NOT NULL,
            tenant_id       INTEGER NOT NULL,
            invoice_number  TEXT    NOT NULL,
            billing_month   INTEGER NOT NULL
                                  CHECK (billing_month >= 1 AND billing_month <= 12),
            billing_year    INTEGER NOT NULL
                                  CHECK (billing_year >= 2020 AND billing_year <= 2099),
            amount          REAL    NOT NULL
                                  CHECK (amount >= 0 AND amount <= 999999999),
            due_date        TEXT    NOT NULL,
            status          TEXT    NOT NULL DEFAULT 'Unpaid'
                                  CHECK (status IN ('Unpaid', 'Paid', 'Partial', 'Overdue', 'Cancelled')),
            notes           TEXT    DEFAULT NULL
                                  CHECK (notes IS NULL OR length(notes) <= 500),
            created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            UNIQUE (contract_id, billing_month, billing_year)
        );
    `);

    // 7. payments (separate table for full payment audit trail)
    db.exec(`
        CREATE TABLE IF NOT EXISTS payments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id      INTEGER NOT NULL
                            REFERENCES invoices(id) ON DELETE CASCADE,
            amount          REAL    NOT NULL
                                  CHECK (amount > 0 AND amount <= 999999999),
            payment_date    TEXT    NOT NULL,
            payment_method  TEXT    NOT NULL
                                  CHECK (payment_method IN ('Cash', 'BankTransfer', 'Cheque')),
            notes           TEXT    DEFAULT NULL
                                  CHECK (notes IS NULL OR length(notes) <= 250),
            created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
    `);

    // 8. expenses
    db.exec(`
        CREATE TABLE IF NOT EXISTS expenses (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id           INTEGER NOT NULL
                              REFERENCES users(id) ON DELETE CASCADE,
            property_id       INTEGER DEFAULT NULL
                              REFERENCES properties(id) ON DELETE SET NULL,
            unit_id           INTEGER DEFAULT NULL
                              REFERENCES units(id) ON DELETE SET NULL,
            type              TEXT    NOT NULL
                              CHECK (type IN ('Maintenance', 'Utilities', 'Repairs', 'Cleaning', 'MunicipalityFees', 'Insurance', 'Other')),
            amount            REAL    NOT NULL
                              CHECK (amount > 0 AND amount <= 999999999),
            date              TEXT    NOT NULL,
            description       TEXT    NOT NULL
                              CHECK (length(description) >= 3 AND length(description) <= 500),
            receipt_image_path TEXT   DEFAULT NULL,
            created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
    `);

    // 9. maintenance_tickets
    db.exec(`
        CREATE TABLE IF NOT EXISTS maintenance_tickets (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id           INTEGER NOT NULL
                              REFERENCES users(id) ON DELETE CASCADE,
            unit_id           INTEGER NOT NULL
                              REFERENCES units(id) ON DELETE CASCADE,
            reported_by       TEXT    NOT NULL
                              CHECK (length(reported_by) >= 2 AND length(reported_by) <= 100),
            description       TEXT    NOT NULL
                              CHECK (length(description) >= 10 AND length(description) <= 2000),
            urgency           TEXT    NOT NULL DEFAULT 'Medium'
                              CHECK (urgency IN ('Low', 'Medium', 'High', 'Emergency')),
            status            TEXT    NOT NULL DEFAULT 'Open'
                              CHECK (status IN ('Open', 'InProgress', 'Resolved')),
            issue_image_path  TEXT    DEFAULT NULL,
            resolved_at       TEXT    DEFAULT NULL,
            created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
    `);

    // 10. settings
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL
                            REFERENCES users(id) ON DELETE CASCADE,
            key             TEXT    NOT NULL
                            CHECK (length(key) >= 1 AND length(key) <= 50),
            value           TEXT    NOT NULL
                            CHECK (length(value) >= 0 AND length(value) <= 255),
            created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            UNIQUE (user_id, key)
        );
    `);

    // 11. audit_log
    db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER DEFAULT NULL
                            REFERENCES users(id) ON DELETE SET NULL,
            action          TEXT    NOT NULL
                            CHECK (length(action) >= 2 AND length(action) <= 50),
            target_id       INTEGER DEFAULT NULL,
            ip_address      TEXT    DEFAULT NULL
                            CHECK (ip_address IS NULL OR length(ip_address) <= 45),
            user_agent      TEXT    DEFAULT NULL
                            CHECK (user_agent IS NULL OR length(user_agent) <= 500),
            details         TEXT    DEFAULT NULL,
            created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
    `);

    // ── Create Indexes ─────────────────────────────────────────────────────

    // Properties
    db.exec(`CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_properties_name ON properties(name);`);

    // Units
    db.exec(`CREATE INDEX IF NOT EXISTS idx_units_property_id ON units(property_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_units_property_status ON units(property_id, status);`);

    // Tenants
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tenants_full_name ON tenants(full_name);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tenants_is_former ON tenants(is_former);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tenants_name_former ON tenants(user_id, is_former, full_name);`);

    // Contracts
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contracts_tenant_id ON contracts(tenant_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contracts_unit_id ON contracts(unit_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contracts_active ON contracts(unit_id, status) WHERE status = 'Active';`);

    // Invoices
    db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_contract_id ON invoices(contract_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_unit_id ON invoices(unit_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_billing_period ON invoices(billing_year, billing_month);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices(status, due_date);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_user_lookup ON invoices(tenant_id, billing_year, billing_month, status);`);

    // Payments
    db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);`);

    // Expenses
    db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_property_id ON expenses(property_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);`);

    // Maintenance Tickets
    db.exec(`CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_user_id ON maintenance_tickets(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_unit_id ON maintenance_tickets(unit_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_status ON maintenance_tickets(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_urgency ON maintenance_tickets(urgency);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_status_urgency ON maintenance_tickets(status, urgency);`);

    // Settings
    db.exec(`CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);`);

    // Audit Log
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);`);

    // ── Create Triggers for automatic updated_at ─────────────────────────

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
            AFTER UPDATE ON users
            FOR EACH ROW
        BEGIN
            UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = OLD.id;
END;
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_properties_updated_at
            AFTER UPDATE ON properties
            FOR EACH ROW
        BEGIN
            UPDATE properties SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = OLD.id;
END;
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_units_updated_at
            AFTER UPDATE ON units
            FOR EACH ROW
        BEGIN
            UPDATE units SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = OLD.id;
END;
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_tenants_updated_at
            AFTER UPDATE ON tenants
            FOR EACH ROW
        BEGIN
            UPDATE tenants SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = OLD.id;
END;
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_contracts_updated_at
            AFTER UPDATE ON contracts
            FOR EACH ROW
        BEGIN
            UPDATE contracts SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = OLD.id;
END;
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_invoices_updated_at
            AFTER UPDATE ON invoices
            FOR EACH ROW
        BEGIN
            UPDATE invoices SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = OLD.id;
END;
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_expenses_updated_at
            AFTER UPDATE ON expenses
            FOR EACH ROW
        BEGIN
            UPDATE expenses SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = OLD.id;
END;
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_maintenance_tickets_updated_at
            AFTER UPDATE ON maintenance_tickets
            FOR EACH ROW
        BEGIN
            UPDATE maintenance_tickets SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = OLD.id;
END;
    `);

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_settings_updated_at
            AFTER UPDATE ON settings
            FOR EACH ROW
        BEGIN
            UPDATE settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = OLD.id;
END;
    `);

    console.log('[DB] Database initialized successfully at:', DB_PATH);
    console.log('[DB] WAL mode enabled, foreign_keys enforced, all tables created.');

    return db;
}

/**
 * Returns the existing database instance. Throws if not yet initialized.
 */
function getDatabase() {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return db;
}

/**
 * Closes the database connection gracefully.
 */
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        console.log('[DB] Database connection closed.');
    }
}

module.exports = {
    initializeDatabase,
    getDatabase,
    closeDatabase,
};
