import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let appInstance = null;
let dbInstance = null;

function clearModuleCache() {
    const serverDir = path.resolve(__dirname, '..');
    Object.keys(require.cache).forEach((key) => {
        if (key.startsWith(serverDir) && !key.includes('node_modules')) {
            delete require.cache[key];
        }
    });
}

export function createTestApp() {
    clearModuleCache();

    process.env.DATABASE_PATH = ':memory:';
    process.env.JWT_SECRET = 'test-secret-' + crypto.randomUUID();
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.NODE_ENV = 'test';

    const app = require('../server');
    const { getDatabase } = require('../database');
    const db = getDatabase();

    appInstance = app;
    dbInstance = db;

    return { app, db };
}

export function closeTestApp() {
    if (dbInstance) {
        try { dbInstance.close(); } catch (e) { /* ignore */ }
        dbInstance = null;
    }
    appInstance = null;
    clearModuleCache();
}
