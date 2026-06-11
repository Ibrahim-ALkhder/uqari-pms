import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp, closeTestApp } from './helpers.mjs';

let app;
let db;

beforeAll(() => {
    const ctx = createTestApp();
    app = ctx.app;
    db = ctx.db;
});

afterAll(() => {
    closeTestApp();
});

describe('Auth Middleware', () => {
    it('should reject requests without Authorization header', async () => {
        const res = await request(app)
            .get('/api/properties')
            .expect(401);

        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('تسجيل الدخول');
    });

    it('should reject requests with malformed token', async () => {
        const res = await request(app)
            .get('/api/properties')
            .set('Authorization', 'Bearer not-a-valid-token')
            .expect(401);

        expect(res.body.success).toBe(false);
    });

    it('should reject requests with expired token', async () => {
        const expiredToken = jwt.sign(
            { userId: 1, role: 'landlord' },
            process.env.JWT_SECRET,
            { expiresIn: '0s' }
        );

        await new Promise(r => setTimeout(r, 100));

        const res = await request(app)
            .get('/api/properties')
            .set('Authorization', `Bearer ${expiredToken}`)
            .expect(401);

        expect(res.body.success).toBe(false);
    });

    it('should reject requests with wrong secret', async () => {
        const fakeToken = jwt.sign(
            { userId: 1, role: 'landlord' },
            'wrong-secret-key',
            { expiresIn: '1h' }
        );

        const res = await request(app)
            .get('/api/properties')
            .set('Authorization', `Bearer ${fakeToken}`)
            .expect(401);

        expect(res.body.success).toBe(false);
    });
});

describe('404 Handler', () => {
    it('should return Arabic message for unknown routes', async () => {
        const res = await request(app)
            .get('/api/nonexistent')
            .expect(404);

        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('المسار غير موجود');
    });
});

describe('CORS', () => {
    it('should allow requests from allowed origins in dev mode', async () => {
        const res = await request(app)
            .options('/api/health')
            .set('Origin', 'http://localhost:5173')
            .set('Access-Control-Request-Method', 'GET');

        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
});
