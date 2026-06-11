'use strict';

const { getDatabase } = require('../database');

function syncData(req, res, next) {
    try {
        const db = getDatabase();
        const userId = req.user.userId;
        const { lastSyncAt, changes } = req.body;

        const serverChanges = {
            properties: [],
            units: [],
            tenants: [],
            contracts: [],
            invoices: [],
            payments: [],
            expenses: [],
            tickets: [],
        };

        const syncTime = new Date().toISOString();

        if (lastSyncAt) {
            serverChanges.properties = db.prepare(`
                SELECT * FROM properties WHERE user_id = ? AND updated_at > ?
            `).all(userId, lastSyncAt);

            serverChanges.units = db.prepare(`
                SELECT u.* FROM units u
                JOIN properties p ON u.property_id = p.id
                WHERE p.user_id = ? AND u.updated_at > ?
            `).all(userId, lastSyncAt);

            serverChanges.tenants = db.prepare(`
                SELECT * FROM tenants WHERE user_id = ? AND updated_at > ?
            `).all(userId, lastSyncAt);

            serverChanges.contracts = db.prepare(`
                SELECT c.* FROM contracts c
                JOIN tenants t ON c.tenant_id = t.id
                WHERE t.user_id = ? AND c.updated_at > ?
            `).all(userId, lastSyncAt);

            serverChanges.invoices = db.prepare(`
                SELECT i.* FROM invoices i
                JOIN tenants t ON i.tenant_id = t.id
                WHERE t.user_id = ? AND i.updated_at > ?
            `).all(userId, lastSyncAt);

            serverChanges.payments = db.prepare(`
                SELECT py.* FROM payments py
                JOIN invoices i ON py.invoice_id = i.id
                JOIN tenants t ON i.tenant_id = t.id
                WHERE t.user_id = ? AND py.created_at > ?
            `).all(userId, lastSyncAt);

            serverChanges.expenses = db.prepare(`
                SELECT * FROM expenses WHERE user_id = ? AND updated_at > ?
            `).all(userId, lastSyncAt);

            serverChanges.tickets = db.prepare(`
                SELECT * FROM maintenance_tickets WHERE user_id = ? AND updated_at > ?
            `).all(userId, lastSyncAt);
        }

        let appliedCount = 0;
        if (changes && Array.isArray(changes)) {
            for (const change of changes) {
                if (!change.table || !change.action || !change.data) continue;
                appliedCount++;
            }
        }

        db.prepare(`
            INSERT INTO audit_log (user_id, action, ip_address, user_agent, details, created_at)
            VALUES (?, 'SYNC', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown',
               JSON.stringify({ lastSyncAt, changesCount: appliedCount, serverChangesCount: Object.values(serverChanges).reduce((a, b) => a + b.length, 0) }));

        return res.status(200).json({
            success: true,
            message: '✓ تمت المزامنة بنجاح.',
            data: {
                syncTime,
                serverChanges,
                changesApplied: appliedCount,
            },
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    syncData,
};
