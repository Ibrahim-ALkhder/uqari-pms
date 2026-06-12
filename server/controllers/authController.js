// =============================================================================
// authController.js – Authentication Request Handlers
// =============================================================================
// Handles POST /api/auth/register and POST /api/auth/login.
// Uses bcrypt for password hashing and jsonwebtoken for session tokens.
// All responses use Arabic error/success messages.
// =============================================================================

'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
    console.warn('[WARN] JWT_SECRET not set. Using insecure development fallback. Set JWT_SECRET in production.');
    return 'pms_jwt_secret_change_in_production_2026';
})();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = 12;

/**
 * Validates the registration input fields.
 * Returns an array of error objects, or an empty array if valid.
 *
 * @param {Object} body - Request body
 * @returns {Array} errors - Array of { field, message } objects
 */
function validateRegistrationInput(body) {
    const errors = [];
    const { name, email, password } = body;

    // Full Name validation
    if (!name || typeof name !== 'string') {
        errors.push({ field: 'name', message: 'الاسم الكامل مطلوب.' });
    } else if (name.trim().length < 2) {
        errors.push({ field: 'name', message: 'الاسم يجب أن يكون حرفين على الأقل.' });
    } else if (name.trim().length > 100) {
        errors.push({ field: 'name', message: 'الاسم يجب أن لا يتجاوز 100 حرف.' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string') {
        errors.push({ field: 'email', message: 'البريد الإلكتروني مطلوب.' });
    } else if (!emailRegex.test(email.trim())) {
        errors.push({ field: 'email', message: 'صيغة البريد الإلكتروني غير صحيحة.' });
    } else if (email.trim().length > 255) {
        errors.push({ field: 'email', message: 'البريد الإلكتروني طويل جداً.' });
    }

    // Password validation
    if (!password || typeof password !== 'string') {
        errors.push({ field: 'password', message: 'كلمة المرور مطلوبة.' });
    } else if (password.length < 6) {
        errors.push({ field: 'password', message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
    } else if (password.length > 128) {
        errors.push({ field: 'password', message: 'كلمة المرور طويلة جداً. الحد الأقصى 128 حرفاً.' });
    }

    return errors;
}

/**
 * Validates the login input fields.
 * Returns an array of error objects, or an empty array if valid.
 *
 * @param {Object} body - Request body
 * @returns {Array} errors - Array of { field, message } objects
 */
function validateLoginInput(body) {
    const errors = [];
    const { email, password } = body;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string') {
        errors.push({ field: 'email', message: 'البريد الإلكتروني مطلوب.' });
    } else if (!emailRegex.test(email.trim())) {
        errors.push({ field: 'email', message: 'صيغة البريد الإلكتروني غير صحيحة.' });
    }

    if (!password || typeof password !== 'string') {
        errors.push({ field: 'password', message: 'كلمة المرور مطلوبة.' });
    } else if (password.length < 6) {
        errors.push({ field: 'password', message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
    } else if (password.length > 128) {
        errors.push({ field: 'password', message: 'كلمة المرور طويلة جداً.' });
    }

    return errors;
}

/**
 * POST /api/auth/register
 * Creates a new landlord user account with hashed password.
 * Returns a JWT token on success.
 *
 * Request body: { name, email, password }
 */
async function register(req, res, next) {
    try {
        const { name, email, password } = req.body;

        // ── Validate input ─────────────────────────────────────────────────
        const validationErrors = validateRegistrationInput(req.body);
        if (validationErrors.length > 0) {
            return res.status(422).json({
                success: false,
                message: 'بيانات التسجيل غير صالحة.',
                errors: validationErrors,
            });
        }

        const db = getDatabase();

        // ── Check for duplicate email ──────────────────────────────────────
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'البريد الإلكتروني مسجل مسبقاً. يرجى استخدام بريد إلكتروني آخر.',
                errors: [
                    { field: 'email', message: 'البريد الإلكتروني موجود بالفعل.' },
                ],
            });
        }

        // ── Hash the password ──────────────────────────────────────────────
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        const passwordHash = await bcrypt.hash(password, salt);

        // ── Insert the new user ────────────────────────────────────────────
        const insertUser = db.prepare(`
            INSERT INTO users (name, email, password_hash, role, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 'landlord', 1,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `);

        const result = insertUser.run(name.trim(), email.trim().toLowerCase(), passwordHash);
        const userId = result.lastInsertRowid;

        // ── Insert default settings for the new user ───────────────────────
        const defaultSettings = [
            { key: 'currency', value: 'SAR' },
            { key: 'billingDay', value: '1' },
            { key: 'dueDay', value: '5' },
            { key: 'fontSize', value: 'extraLarge' },
            { key: 'pinEnabled', value: 'false' },
        ];

        const insertSetting = db.prepare(`
            INSERT INTO settings (user_id, key, value, created_at, updated_at)
            VALUES (?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `);

        const insertSettingsTransaction = db.transaction(() => {
            for (const setting of defaultSettings) {
                insertSetting.run(userId, setting.key, setting.value);
            }
        });

        insertSettingsTransaction();

        // ── Generate JWT token ─────────────────────────────────────────────
        const tokenPayload = {
            userId: userId,
            role: 'landlord',
            email: email.trim().toLowerCase(),
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
        });

        // ── Log the registration in audit_log ──────────────────────────────
        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'REGISTER', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(userId, userId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        // ── Return success ─────────────────────────────────────────────────
        return res.status(201).json({
            success: true,
            message: '✓ تم إنشاء الحساب بنجاح. مرحباً بك في نظام إدارة العقارات.',
            data: {
                token: token,
                user: {
                    id: userId,
                    name: name.trim(),
                    email: email.trim().toLowerCase(),
                    role: 'landlord',
                    hasPin: false,
                },
            },
        });

    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/auth/login
 * Authenticates a user by email and password.
 * Returns a JWT token on success.
 *
 * Request body: { email, password }
 */
async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        // ── Validate input ─────────────────────────────────────────────────
        const validationErrors = validateLoginInput(req.body);
        if (validationErrors.length > 0) {
            return res.status(422).json({
                success: false,
                message: 'بيانات الدخول غير صالحة.',
                errors: validationErrors,
            });
        }

        const db = getDatabase();

        // ── Find the user by email ─────────────────────────────────────────
        const user = db.prepare(`
            SELECT id, name, email, password_hash, pin_hash, role, is_active
            FROM users
            WHERE email = ?
        `).get(email.trim().toLowerCase());

        // ── Generic "invalid credentials" message (prevents user enumeration) ─
        if (!user) {
            // Log the failed attempt for security monitoring
            db.prepare(`
                INSERT INTO audit_log (user_id, action, ip_address, user_agent, details, created_at)
                VALUES (NULL, 'FAILED_LOGIN', ?, ?, ?,
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            `).run(req.ipAddress || '0.0.0.0', req.userAgent || 'unknown', JSON.stringify({ email: email }));

            return res.status(401).json({
                success: false,
                message: '❌ اسم المستخدم أو كلمة المرور غير صحيحة.',
            });
        }

        // ── Check if user account is active ────────────────────────────────
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'تم تعطيل هذا الحساب. يرجى التواصل مع الدعم الفني.',
            });
        }

        // ── Compare password ───────────────────────────────────────────────
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            // Log the failed attempt for security monitoring
            db.prepare(`
                INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, details, created_at)
                VALUES (?, 'FAILED_LOGIN', ?, ?, ?, ?,
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            `).run(user.id, user.id, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown', JSON.stringify({ reason: 'wrong_password' }));

            return res.status(401).json({
                success: false,
                message: '❌ اسم المستخدم أو كلمة المرور غير صحيحة.',
            });
        }

        // ── Generate JWT token ─────────────────────────────────────────────
        const tokenPayload = {
            userId: user.id,
            role: user.role,
            email: user.email,
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
        });

        // ── Log the successful login ───────────────────────────────────────
        db.prepare(`
            INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
            VALUES (?, 'LOGIN', ?, ?, ?,
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(user.id, user.id, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

        // ── Return success ─────────────────────────────────────────────────
        return res.status(200).json({
            success: true,
            message: '✓ تم تسجيل الدخول بنجاح.',
            data: {
                token: token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    hasPin: user.pin_hash !== null,
                },
            },
        });

    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/auth/verify-pin
 * Verifies the landlord's 4-digit PIN after login.
 *
 * Request body: { pin }
 */
async function verifyPin(req, res, next) {
    try {
        const { pin } = req.body;
        const userId = req.user.userId;

        // ── Validate PIN format ────────────────────────────────────────────
        if (!pin || typeof pin !== 'string') {
            return res.status(422).json({
                success: false,
                message: 'الرقم السري مطلوب.',
                errors: [{ field: 'pin', message: 'الرجاء إدخال الرقم السري.' }],
            });
        }

        if (!/^\d{4}$/.test(pin)) {
            return res.status(422).json({
                success: false,
                message: 'الرقم السري يجب أن يكون 4 أرقام فقط.',
                errors: [{ field: 'pin', message: 'يجب أن يتكون من 4 أرقام.' }],
            });
        }

        const db = getDatabase();

        // ── Check for account lockout ──────────────────────────────────────
        const lockoutCheck = db.prepare(`
            SELECT COUNT(*) as attempt_count, MAX(created_at) as last_attempt
            FROM audit_log
            WHERE user_id = ?
              AND action = 'FAILED_PIN'
              AND created_at > datetime('now', '-5 minutes')
        `).get(userId);

        if (lockoutCheck.attempt_count >= 3) {
            return res.status(429).json({
                success: false,
                message: 'تم قفل الدخول مؤقتاً. حاول بعد 5 دقائق.',
            });
        }

        // ── Get the user's PIN hash ────────────────────────────────────────
        const user = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(userId);

        if (!user || !user.pin_hash) {
            return res.status(400).json({
                success: false,
                message: 'الرقم السري غير مفعل. يمكنك تخطي هذه الخطوة.',
            });
        }

        // ── Compare PIN ────────────────────────────────────────────────────
        const isPinValid = await bcrypt.compare(pin, user.pin_hash);

        if (!isPinValid) {
            // Log failed PIN attempt
            db.prepare(`
                INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
                VALUES (?, 'FAILED_PIN', ?, ?, ?,
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            `).run(userId, userId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

            return res.status(401).json({
                success: false,
                message: '❌ الرقم السري غير صحيح.',
            });
        }

        return res.status(200).json({
            success: true,
            message: '✓ تم التحقق من الرقم السري بنجاح.',
            data: {
                verified: true,
            },
        });

    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/auth/change-pin
 * Changes or disables the 4-digit PIN.
 *
 * Request body: { currentPin, newPin, confirmPin }
 *   - To change PIN: provide currentPin, newPin (4 digits), confirmPin (must match newPin)
 *   - To disable PIN: provide currentPin, newPin = null, confirmPin = null
 */
async function changePin(req, res, next) {
    try {
        const { currentPin, newPin, confirmPin } = req.body;
        const userId = req.user.userId;

        const db = getDatabase();

        // ── Check current PIN status ───────────────────────────────────────
        const user = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(userId);
        const hasExistingPin = user && user.pin_hash;

        if (hasExistingPin) {
            // ── Validate current PIN ───────────────────────────────────────
            if (!currentPin || typeof currentPin !== 'string' || !/^\d{4}$/.test(currentPin)) {
                return res.status(422).json({
                    success: false,
                    message: 'الرقم السري الحالي يجب أن يكون 4 أرقام.',
                    errors: [{ field: 'currentPin', message: 'يجب أن يتكون من 4 أرقام.' }],
                });
            }

            const isCurrentPinValid = await bcrypt.compare(currentPin, user.pin_hash);
            if (!isCurrentPinValid) {
                return res.status(401).json({
                    success: false,
                    message: '❌ الرقم السري الحالي غير صحيح.',
                });
            }
        }

        // ── Handle disabling the PIN ───────────────────────────────────────
        if (newPin === null || newPin === undefined || newPin === '') {
            db.prepare('UPDATE users SET pin_hash = NULL, updated_at = strftime(\'%Y-%m-%dT%H:%M:%SZ\', \'now\') WHERE id = ?').run(userId);

            db.prepare(`
                INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
                VALUES (?, 'PIN_CHANGE', ?, ?, ?,
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            `).run(userId, userId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

            return res.status(200).json({
                success: true,
                message: '✓ تم إلغاء الرقم السري بنجاح.',
            });
        }

        // ── Handle setting a new PIN ───────────────────────────────────────
        if (newPin && confirmPin) {
            // Validate new PIN format
            if (!/^\d{4}$/.test(newPin)) {
                return res.status(422).json({
                    success: false,
                    message: 'الرقم السري الجديد يجب أن يكون 4 أرقام فقط.',
                    errors: [{ field: 'newPin', message: 'يجب أن يتكون من 4 أرقام.' }],
                });
            }

            // Check that new PIN matches confirmation
            if (newPin !== confirmPin) {
                return res.status(422).json({
                    success: false,
                    message: 'الرقمان غير متطابقين.',
                    errors: [
                        { field: 'newPin', message: 'الرقم السري الجديد غير متطابق مع التأكيد.' },
                        { field: 'confirmPin', message: 'تأكيد الرقم السري غير متطابق.' },
                    ],
                });
            }

            // Hash and update the new PIN
            const salt = await bcrypt.genSalt(SALT_ROUNDS);
            const newPinHash = await bcrypt.hash(newPin, salt);

            db.prepare('UPDATE users SET pin_hash = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%SZ\', \'now\') WHERE id = ?').run(newPinHash, userId);

            db.prepare(`
                INSERT INTO audit_log (user_id, action, target_id, ip_address, user_agent, created_at)
                VALUES (?, 'PIN_CHANGE', ?, ?, ?,
                        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            `).run(userId, userId, req.ipAddress || '0.0.0.0', req.userAgent || 'unknown');

            return res.status(200).json({
                success: true,
                message: '✓ تم تحديث الرقم السري بنجاح.',
            });
        }

        // ── If we reach here, the request body is ambiguous ────────────────
        return res.status(422).json({
            success: false,
            message: 'بيانات غير مكتملة. يرجى إرسال الرقم السري الجديد وتأكيده، أو إرسال قيم فارغة لإلغاء الرقم السري.',
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    register,
    login,
    verifyPin,
    changePin,
};
