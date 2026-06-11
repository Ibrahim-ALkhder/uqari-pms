import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: [],
        testTimeout: 15000,
        hookTimeout: 15000,
        sequence: {
            concurrent: false,
        },
        coverage: {
            reporter: ['text', 'lcov'],
            include: ['controllers/**/*.js', 'middleware/**/*.js', 'cron/**/*.js'],
        },
    },
});
