import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], testTimeout: 60000, hookTimeout: 60000, pool: 'forks', env: { APAAR_TEST_DB: 'pglite', SESSION_SECRET: 'test-secret-test-secret-test-secret-1234', BOOTSTRAP_TOKEN: 'bootstrap-token-for-tests-only', EVAL_ROW_CAP: '3000' } } });
