// =============================================================================
// server.js – Main Express Application Entry Point
// =============================================================================
// Configures global middlewares (CORS, JSON parsing, Helmet security headers,
// Morgan request logging), initializes the database, and mounts route modules.
// Listens on process.env.PORT || 3001.
// =============================================================================

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// ── JWT_SECRET Guard ────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET environment variable is required in production mode.');
    console.error('[FATAL] Set JWT_SECRET to a strong random string (e.g. openssl rand -hex 64).');
    process.exit(1);
}

// ── Database Initialization ────────────────────────────────────────────────
const { initializeDatabase } = require('./database');

const db = initializeDatabase();

// ── Route Imports ──────────────────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const unitRoutes = require('./routes/unitRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const contractRoutes = require('./routes/contractRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const syncRoutes = require('./routes/syncRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

// ── Financial Cron Engine ────────────────────────────────────────────────
const { startFinancialCron } = require('./cron/financialCron');

// ── Express Application ────────────────────────────────────────────────────
const app = express();

// ── Global Middleware Stack ─────────────────────────────────────────────────

// 1. Helmet – Sets secure HTTP headers (X-Frame-Options, CSP, HSTS, etc.)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// 2. CORS – Allow all origins in development, explicit origins in production
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (server-to-server, curl, mobile apps)
        // Allow all origins in development mode
        if (!origin || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400, // 24 hours
}));

// 3. Body Parsing – JSON payloads with size limit
app.use(express.json({
    limit: '10mb',
    strict: true,
}));

// 4. URL-encoded body parsing (for forms, though mainly JSON is used)
app.use(express.urlencoded({
    extended: true,
    limit: '10mb',
}));

// 5. Morgan – HTTP request logging
if (process.env.NODE_ENV === 'production') {
    app.use(morgan('combined'));
} else {
    app.use(morgan('dev'));
}

// ── Health Check Endpoint ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'النظام يعمل بشكل طبيعي',
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
        },
    });
});

// ── Mount Route Modules ────────────────────────────────────────────────────

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

// ── Serve uploaded files ─────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── 404 Handler – Unknown routes ───────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'المسار غير موجود',
    });
});

// ── Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
    // Log the full error for server-side debugging
    console.error('[ERROR]', err.stack || err.message || err);

    // Determine the status code
    let statusCode = err.statusCode || err.status || 500;
    let message = err.message || 'حدث خطأ في الخادم. الرجاء المحاولة لاحقاً.';

    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 422;
        message = 'بيانات الإدخال غير صالحة';
    } else if (err.name === 'UnauthorizedError' || err.code === 'UnauthorizedError') {
        statusCode = 401;
        message = 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.';
    } else if (err.name === 'MulterError') {
        statusCode = 400;
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = 'الملف كبير جداً. الحد الأقصى 5 ميجابايت.';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            message = 'حقل الملف غير متوقع.';
        } else {
            message = 'خطأ في رفع الملف.';
        }
    } else if (err.message && err.message.includes('Origin')) {
        statusCode = 403;
        message = 'الوصول مرفوع من هذا المصدر.';
    }

    // In production, don't expose stack traces
    const responsePayload = {
        success: false,
        message: message,
    };

    // Add field-level errors if available (from express-validator)
    if (err.errors && Array.isArray(err.errors)) {
        responsePayload.errors = err.errors.map(e => ({
            field: e.path || e.param || e.field,
            message: e.msg || e.message,
        }));
    }

    // Only include stack in development mode
    if (process.env.NODE_ENV !== 'production') {
        responsePayload.stack = err.stack;
    }

    res.status(statusCode).json(responsePayload);
});

// ── Start Server ───────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
    const PORT = process.env.PORT || 3001;

    const server = app.listen(PORT, () => {
        console.log('='.repeat(60));
        console.log(`  PMS Backend Server`);
        console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
        console.log(`  Port        : ${PORT}`);
        console.log(`  Database    : ${process.env.DATABASE_PATH || path.join(__dirname, 'data', 'pms_database.db')}`);
        console.log(`  CORS Origins: ${allowedOrigins.join(', ')}`);
        console.log('='.repeat(60));

        // ── Seed Database (non-blocking, in child process) ──────────────────
        setTimeout(() => {
            const cp = require('child_process');
            const child = cp.fork('./seed.js', [], { silent: true });
            child.stdout.on('data', (d) => process.stdout.write(`[SEED] ${d}`));
            child.stderr.on('data', (d) => process.stderr.write(`[SEED] ${d}`));
            child.on('exit', (code) => {
                if (code === 0) console.log('[SERVER] Database seeded successfully.');
                else console.error(`[SERVER] Seed process exited with code ${code}`);
            });
        }, 2000);

        // ── Start Financial Cron Engine ────────────────────────────────────
        startFinancialCron();
    });

    // ── Graceful Shutdown ──────────────────────────────────────────────────
    process.on('SIGTERM', () => {
        console.log('[SERVER] SIGTERM received. Shutting down gracefully...');
        server.close(() => {
            const { closeDatabase } = require('./database');
            closeDatabase();
            console.log('[SERVER] Server closed.');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('[SERVER] SIGINT received. Shutting down gracefully...');
        server.close(() => {
            const { closeDatabase } = require('./database');
            closeDatabase();
            console.log('[SERVER] Server closed.');
            process.exit(0);
        });
    });
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    const { closeDatabase } = require('./database');
    closeDatabase();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
});

module.exports = app;
