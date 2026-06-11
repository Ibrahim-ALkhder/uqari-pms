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
        .send({ name: 'مالك العقار', email: 'owner@test.com', password: 'password123' });

    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'owner@test.com', password: 'password123' });

    token = loginRes.body.data.token;
});

afterAll(() => {
    closeTestApp();
});

describe('Property CRUD', () => {
    let propertyId;

    it('POST /api/properties - should create a property', async () => {
        const res = await request(app)
            .post('/api/properties')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'عمارة الخليج', city: 'الرياض', unitCount: 5, notes: 'عمارة سكنية' })
            .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBe('عمارة الخليج');
        expect(res.body.data.unitCount).toBe(5);
        propertyId = res.body.data.id;
    });

    it('POST /api/properties - should reject missing required fields', async () => {
        const res = await request(app)
            .post('/api/properties')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'test' })
            .expect(422);

        expect(res.body.success).toBe(false);
    });

    it('POST /api/properties - should reject name < 2 chars', async () => {
        const res = await request(app)
            .post('/api/properties')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'ا', city: 'جدة', unitCount: 1 })
            .expect(422);

        expect(res.body.success).toBe(false);
    });

    it('GET /api/properties - should list all properties', async () => {
        const res = await request(app)
            .get('/api/properties')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].name).toBe('عمارة الخليج');
    });

    it('GET /api/properties/:id - should get a single property', async () => {
        const res = await request(app)
            .get(`/api/properties/${propertyId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(res.body.data.name).toBe('عمارة الخليج');
        expect(res.body.data.units).toBeDefined();
        expect(res.body.data.units.length).toBe(5);
    });

    it('GET /api/properties/:id - should return 404 for non-existent property', async () => {
        const res = await request(app)
            .get('/api/properties/99999')
            .set('Authorization', `Bearer ${token}`)
            .expect(404);

        expect(res.body.success).toBe(false);
    });

    it('PUT /api/properties/:id - should update a property', async () => {
        const res = await request(app)
            .put(`/api/properties/${propertyId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'عمارة الخليج - فرع 2', city: 'جدة' })
            .expect(200);

        expect(res.body.data.name).toBe('عمارة الخليج - فرع 2');
        expect(res.body.data.city).toBe('جدة');
    });

    it('PUT /api/properties/:id - should reject update with empty name', async () => {
        const res = await request(app)
            .put(`/api/properties/${propertyId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: '', city: 'جدة' })
            .expect(422);

        expect(res.body.success).toBe(false);
    });

    it('DELETE /api/properties/:id - should reject without confirm word', async () => {
        const res = await request(app)
            .delete(`/api/properties/${propertyId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ confirm: 'wrong' })
            .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('حذف');
    });

    it('DELETE /api/properties/:id - should delete with correct confirm word', async () => {
        const res = await request(app)
            .delete(`/api/properties/${propertyId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ confirm: 'حذف' })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('حذف');

        const check = await request(app)
            .get(`/api/properties/${propertyId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(404);
    });

    it('should reject requests without auth token', async () => {
        await request(app)
            .get('/api/properties')
            .expect(401);

        await request(app)
            .post('/api/properties')
            .send({ name: 'test', city: 'test', unitCount: 1 })
            .expect(401);

        await request(app)
            .delete('/api/properties/1')
            .send({ confirm: 'حذف' })
            .expect(401);
    });
});

describe('Units via Properties', () => {
    let propId;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/properties')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'برج المملكة', city: 'الرياض', unitCount: 1 });
        propId = res.body.data.id;
    });

    it('should create units under a property', async () => {
        for (let i = 1; i <= 3; i++) {
            const res = await request(app)
                .post('/api/units')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    propertyId: propId,
                    unitNumber: `غرفة ${i}`,
                    type: 'Room',
                    monthlyRent: 2000 + i * 500,
                    floor: i,
                })
                .expect(201);

            expect(res.body.data.unitNumber).toBe(`غرفة ${i}`);
        }

        const propRes = await request(app)
            .get(`/api/properties/${propId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(propRes.body.data.units.length).toBe(4);
    });

    it('should toggle unit status to UnderMaintenance', async () => {
        const unitsRes = await request(app)
            .get(`/api/properties/${propId}`)
            .set('Authorization', `Bearer ${token}`);

        const unitId = unitsRes.body.data.units[0].id;

        const res = await request(app)
            .patch(`/api/units/${unitId}/status`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'UnderMaintenance' })
            .expect(200);

        expect(res.body.data.status).toBe('UnderMaintenance');
    });
});
