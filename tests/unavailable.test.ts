import { describe, it, expect } from 'vitest';
process.env.APAAR_TEST_DB = ''; process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
describe('database unavailable', () => {
  it('reports a genuine 503 and does not fake success', async () => {
    const { call } = await import('./helpers.js');
    const r = await call('POST', '/eval/start', { body: { role: 'regulator' } }); expect(r.status).toBe(503); expect(r.json.error.code).toBe('database_unavailable'); expect((await call('GET', '/ready')).status).toBe(503);
  });
});
