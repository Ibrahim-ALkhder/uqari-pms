import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
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

describe('POST /api/auth/register', () => {
    const validUser = {
        name: 'أحمد محمد',
        email: 'test@example.com',
        password: 'password123',
    };

    it('should register a new user and return JWT', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(validUser)
            .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('تم إنشاء الحساب');
        expect(res.body.data.token).toBeDefined();
        expect(res.body.data.user.name).toBe('أحمد محمد');
        expect(res.body.data.user.email).toBe('test@example.com');
    });

    it('should reject duplicate email', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(validUser)
            .expect(409);

        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('مسجل مسبقاً');
    });

    it('should reject missing fields', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'test' })
            .expect(422);

        expect(res.body.success).toBe(false);
        expect(res.body.errors.length).toBe(2); // email + password
    });

    it('should reject invalid email', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'test', email: 'not-an-email', password: '123456' })
            .expect(422);

        expect(res.body.errors[0].field).toBe('email');
    });

    it('should reject short password', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'test', email: 'a@b.com', password: '12345' })
            .expect(422);

        expect(res.body.errors[0].field).toBe('password');
    });
});

describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'password123' })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.token).toBeDefined();
    });

    it('should reject wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'wrongpass' })
            .expect(401);

        expect(res.body.success).toBe(false);
    });

    it('should reject non-existent email', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@example.com', password: 'password123' })
            .expect(401);

        expect(res.body.success).toBe(false);
    });

    it('should reject missing fields', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({})
            .expect(422);

        expect(res.body.success).toBe(false);
    });
});

describe('POST /api/auth/verify-pin', () => {
    let token;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'password123' });
        token = res.body.data.token;
    });

    it('should reject when no PIN is set', async () => {
        const res = await request(app)
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${token}`)
            .send({ pin: '1234' })
            .expect(400);

        expect(res.body.message).toContain('غير مفعل');
    });

    it('should reject invalid PIN format', async () => {
        const res = await request(app)
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${token}`)
            .send({ pin: 'abc' })
            .expect(422);

        expect(res.body.message).toContain('4 أرقام');
    });

    it('should reject without auth token', async () => {
        const res = await request(app)
            .post('/api/auth/verify-pin')
            .send({ pin: '1234' })
            .expect(401);

        expect(res.body.success).toBe(false);
    });
});

describe('POST /api/auth/change-pin', () => {
    let token;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'password123' });
        token = res.body.data.token;
    });

    it('should allow setting PIN when no PIN exists', async () => {
        const res = await request(app)
            .post('/api/auth/change-pin')
            .set('Authorization', `Bearer ${token}`)
            .send({ newPin: '5678', confirmPin: '5678' })
            .expect(200);

        expect(res.body.success).toBe(true);
    });

    it('should reject without auth', async () => {
        const res = await request(app)
            .post('/api/auth/change-pin')
            .send({ currentPin: '1234', newPin: null, confirmPin: null })
            .expect(401);
    });
});

describe('GET /api/health', () => {
    it('should return healthy status', async () => {
        const res = await request(app)
            .get('/api/health')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('healthy');
    });
});
