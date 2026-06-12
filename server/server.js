'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ── Start Server Immediately ───────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, '0.0.0.0', () => console.log(`Server started on port ${PORT}`));
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
process.on('uncaughtException', (err) => console.error('[FATAL]', err));
process.on('unhandledRejection', (reason) => console.error('[FATAL]', reason));

// ── Background Initialization ──────────────────────────────────────────
setTimeout(() => {
    const { initializeDatabase } = require('./database');
    try { initializeDatabase(); } catch (err) { console.error('[SERVER] DB init skipped:', err.message); }

    let authRoutes, propertyRoutes, unitRoutes, tenantRoutes, contractRoutes;
    let invoiceRoutes, paymentRoutes, expenseRoutes, maintenanceRoutes;
    let dashboardRoutes, syncRoutes, settingsRoutes;

    try {
        authRoutes = require('./routes/authRoutes');
        propertyRoutes = require('./routes/propertyRoutes');
        unitRoutes = require('./routes/unitRoutes');
        tenantRoutes = require('./routes/tenantRoutes');
        contractRoutes = require('./routes/contractRoutes');
        invoiceRoutes = require('./routes/invoiceRoutes');
        paymentRoutes = require('./routes/paymentRoutes');
        expenseRoutes = require('./routes/expenseRoutes');
        maintenanceRoutes = require('./routes/maintenanceRoutes');
        dashboardRoutes = require('./routes/dashboardRoutes');
        syncRoutes = require('./routes/syncRoutes');
        settingsRoutes = require('./routes/settingsRoutes');
    } catch (err) { console.error('[SERVER] Route imports failed:', err.message); }

    if (authRoutes) {
        app.use('/api/auth', authRoutes);
        app.use('/api/properties', propertyRoutes);
        app.use('/api/units', unitRoutes);
        app.use('/api/tenants', tenantRoutes);
        app.use('/api/contracts', contractRoutes);
        app.use('/api/invoices', invoiceRoutes);
        app.use('/api/payments', paymentRoutes);
        app.use('/api/expenses', expenseRoutes);
        app.use('/api/maintenance', maintenanceRoutes);
        app.use('/api/dashboard', dashboardRoutes);
        app.use('/api/sync', syncRoutes);
        app.use('/api/settings', settingsRoutes);
        app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
        app.use((req, res) => res.status(404).json({ success: false, message: 'المسار غير موجود' }));
        app.use((err, req, res, next) => {
            console.error('[ERROR]', err);
            res.status(500).json({ success: false, message: err.message || 'خطأ في الخادم' });
        });
    }

    try {
        const { startFinancialCron } = require('./cron/financialCron');
        startFinancialCron();
    } catch (err) { console.error('[SERVER] Cron skipped:', err.message); }
}, 100);

setTimeout(() => {
    const cp = require('child_process');
    const child = cp.fork('./seed.js', [], { silent: true });
    child.stdout.on('data', (d) => process.stdout.write(`[SEED] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[SEED] ${d}`));
    child.on('exit', (code) => {
        if (code === 0) console.log('[SERVER] Database seeded.');
        else console.error(`[SERVER] Seed exited with code ${code}`);
    });
}, 3000);

module.exports = app;
