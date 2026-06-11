// =============================================================================
// authMiddleware.js – JWT Authentication Middleware
// =============================================================================
// Validates the 'Authorization: Bearer <token>' header from incoming requests.
// On success, attaches the decoded user payload to req.user.
// On failure, returns HTTP 401 with a clear Arabic error message.
// =============================================================================

'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pms_jwt_secret_change_in_production_2026';

/**
 * Authentication Middleware
 * Extracts and verifies the JWT token from the Authorization header.
 * Attaches decoded payload to req.user = { userId, role, email }.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function authenticate(req, res, next) {
    // ── Step 1: Verify the Authorization header exists ──────────────────
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.status(401).json({
            success: false,
            message: 'يرجى تسجيل الدخول أولاً. لم يتم تقديم رمز التحقق.',
        });
        return;
    }

    // ── Step 2: Verify the header uses "Bearer <token>" format ──────────
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        res.status(401).json({
            success: false,
            message: 'تنسيق رمز التحقق غير صحيح. يجب أن يكون: Bearer <token>',
        });
        return;
    }

    const token = parts[1];

    if (!token || token.length === 0) {
        res.status(401).json({
            success: false,
            message: 'رمز التحقق فارغ. يرجى تسجيل الدخول مرة أخرى.',
        });
        return;
    }

    // ── Step 3: Verify the JWT cryptographic signature ──────────────────
    let decoded = null;

    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            res.status(401).json({
                success: false,
                message: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.',
            });
            return;
        }

        if (error.name === 'JsonWebTokenError') {
            res.status(401).json({
                success: false,
                message: 'رمز التحقق غير صالح. يرجى تسجيل الدخول مرة أخرى.',
            });
            return;
        }

        if (error.name === 'NotBeforeError') {
            res.status(401).json({
                success: false,
                message: 'رمز التحقق غير نشط بعد. يرجى المحاولة لاحقاً.',
            });
            return;
        }

        // Generic/unknown JWT error
        res.status(401).json({
            success: false,
            message: 'فشل التحقق من الرمز. يرجى تسجيل الدخول مرة أخرى.',
        });
        return;
    }

    // ── Step 4: Validate the decoded payload contains required fields ───
    if (!decoded || !decoded.userId || !decoded.role) {
        res.status(401).json({
            success: false,
            message: 'رمز التحقق تالف. يرجى تسجيل الدخول مرة أخرى.',
        });
        return;
    }

    // ── Step 5: Attach user information to the request object ───────────
    req.user = {
        userId: decoded.userId,
        role: decoded.role,
        email: decoded.email || null,
    };

    req.ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    req.userAgent = req.headers['user-agent'] || 'unknown';

    // ── Step 6: Only reachable on success — pass control to next handler ─
    next();
}

/**
 * Optional Authentication Middleware
 * Same as authenticate but does NOT block the request if no token is provided.
 * If a valid token is present, req.user is populated; otherwise req.user is null.
 * Useful for endpoints that behave differently for authenticated vs anonymous users.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function optionalAuthenticate(req, res, next) {
    // ── Step 1: If no header is provided, proceed without a user ────────
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        req.user = null;
        next();
        return;
    }

    // ── Step 2: Verify the header uses "Bearer <token>" format ──────────
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        req.user = null;
        next();
        return;
    }

    const token = parts[1];

    if (!token || token.length === 0) {
        req.user = null;
        next();
        return;
    }

    // ── Step 3: Attempt to verify the JWT — failures are non-blocking ───
    let decoded = null;

    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
        // Token invalid/expired — proceed without a user
        req.user = null;
        next();
        return;
    }

    // ── Step 4: Validate the decoded payload ───────────────────────────
    if (decoded && decoded.userId && decoded.role) {
        req.user = {
            userId: decoded.userId,
            role: decoded.role,
            email: decoded.email || null,
        };
    } else {
        req.user = null;
    }

    // ── Step 5: Pass control — req.user may be populated or null ────────
    next();
}

/**
 * Role-Based Authorization Middleware Factory
 * Returns a middleware that checks if the authenticated user has one of the
 * specified roles. Must be used AFTER authenticate middleware.
 *
 * @param  {...string} allowedRoles - One or more role names to allow
 * @returns {Function} Express middleware
 *
 * Usage: router.delete('/properties/:id', authenticate, authorize('landlord', 'admin'), handler);
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        // ── Check that req.user exists (authenticate must run first) ────
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'يرجى تسجيل الدخول أولاً.',
            });
            return;
        }

        // ── Check that the user's role is in the allowed list ───────────
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية للوصول إلى هذا المورد.',
            });
            return;
        }

        // ── All checks passed ─────────────────────────────────────────
        next();
    };
}

module.exports = {
    authenticate,
    optionalAuthenticate,
    authorize,
};
