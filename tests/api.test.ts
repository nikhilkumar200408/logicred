import { describe, it, expect, beforeAll } from 'vitest';
import { call, evalLogin } from './helpers.js';
import { toCsv } from '../server/routes_gov.js';

let reg: string, adm: string, staff: string, state: string, ver: string;
beforeAll(async () => { [reg, adm, staff, state, ver] = await Promise.all(['regulator', 'inst_admin', 'inst_staff', 'state_officer', 'verifier'].map(r => evalLogin(r, 'ip-' + r))); });

describe('platform, auth and evaluation workspace', () => {
  it('reports health and readiness from the real database', async () => {
    expect((await call('GET', '/health')).json.status).toBe('ok');
    const r = await call('GET', '/ready'); expect(r.status).toBe(200); expect(r.json.database).toBe('connected');
  });
  it('requires authentication and rejects tampered sessions', async () => {
    expect((await call('GET', '/cases')).status).toBe(401);
    expect((await call('GET', '/cases', { cookie: reg.slice(0, -3) + 'abc' })).status).toBe(401);
  });
  it('seeds idempotently, even under concurrent starts', async () => {
    await Promise.all([1, 2, 3, 4].map(i => evalLogin('regulator', 'c' + i)));
    const inst = await call('GET', '/institutions', { cookie: reg }); expect(inst.json).toHaveLength(3); expect(inst.json.every((i: any) => i.synthetic)).toBe(true);
    const enr = await call('GET', '/enrolments', { cookie: reg, query: { pageSize: '1' } }); const t = enr.json.total;
    await evalLogin('regulator', 'again'); expect((await call('GET', '/enrolments', { cookie: reg, query: { pageSize: '1' } })).json.total).toBe(t);
  });
  it('never issues administrator sessions publicly', async () => {
    expect((await call('POST', '/eval/start', { body: { role: 'security_admin' } })).status).toBe(400);
    expect((await call('POST', '/users', { cookie: reg, body: { email: 'a@b.co', name: 'Eve', role: 'security_admin', password: 'x'.repeat(14) } })).status).toBe(403);
    expect((await call('GET', '/export/database', { cookie: reg })).status).toBe(403);
  });
  it('rejects cross-origin writes', async () => {
    expect((await call('POST', '/reconcile', { cookie: reg, headers: { origin: 'https://evil.example', host: 'app.example' } })).status).toBe(403);
  });
});

describe('access scoping', () => {
  it('limits institution users to their own institution', async () => {
    const i = await call('GET', '/institutions', { cookie: adm }); expect(i.json).toHaveLength(1); expect(i.json[0].code).toBe('SYN-1001');
    const e = await call('GET', '/enrolments', { cookie: adm, query: { pageSize: '100' } }); expect(e.json.items.every((r: any) => r.institution_code === 'SYN-1001')).toBe(true);
    const other = (await call('GET', '/enrolments', { cookie: reg, query: { institution_id: (await call('GET', '/institutions', { cookie: reg })).json.find((x: any) => x.code === 'SYN-1002').id } })).json.items[0];
    expect((await call('GET', '/enrolments/' + other.id, { cookie: adm })).status).toBe(404);
  });
  it('scopes state officers by jurisdiction and masks identifiers', async () => {
    const i = await call('GET', '/institutions', { cookie: state }); expect(i.json.map((x: any) => x.state)).toEqual(['Madhya Pradesh', 'Madhya Pradesh']);
    expect((await call('GET', '/enrolments', { cookie: state })).json.items[0].apaar_id).toMatch(/\*/);
    expect((await call('POST', '/imports/preview', { cookie: state, body: { rows: [{}] } })).status).toBe(403);
  });
  it('keeps verification users away from student records', async () => {
    for (const p of ['/enrolments', '/cases', '/overview', '/audit']) expect((await call('GET', p, { cookie: ver })).status).toBe(403);
  });
});

describe('reconciliation, evidence and seeded scenarios', () => {
  it('calculates intake from persisted data and the approval reference', async () => {
    const g = (await call('GET', '/integrity', { cookie: reg })).json; const r = g.rows.find((x: any) => x.institution_code === 'SYN-1001' && x.programme === 'B.Tech CSE' && x.year === '2026-27');
    expect(r.approved).toBe(10); expect(r.regular).toBe(14); expect(r.variance).toBe(4); expect(r.status).toBe('Exceeds approved intake'); expect(r.special).toBe(2); expect(r.reference).toMatch(/^SYN-APR/);
  });
  it('raises explainable findings and treats a legitimate transfer as no conflict', async () => {
    const f = (await call('GET', '/findings', { cookie: reg, query: { pageSize: '100' } })).json.items;
    const types = new Set(f.map((x: any) => x.type)); ['intake_excess', 'concurrent_enrolment', 'identity_mismatch', 'stale_status'].forEach(t => expect(types.has(t)).toBe(true));
    const c = f.find((x: any) => x.type === 'concurrent_enrolment'); expect(c.rule_key).toBe('concurrent-enrolment'); expect(c.calculation).toMatch(/enrolments/); expect(c.recommendation).toMatch(/not proof/);
    expect(JSON.stringify(f.filter((x: any) => x.type === 'concurrent_enrolment'))).not.toContain('Tara Menon');
  });
  it('preserves a corrected record with history and a resolved case', async () => {
    const ch = (await call('GET', '/changes', { cookie: reg })).json.items; expect(ch.length).toBeGreaterThan(0); expect(ch[0].impact.affected.some((a: any) => a.outcome === 'cleared')).toBe(true);
    const cases = (await call('GET', '/cases', { cookie: reg, query: { status: 'Resolved', pageSize: '50' } })).json.items; expect(cases.length).toBeGreaterThan(0);
    const d = (await call('GET', '/cases/' + cases[0].id, { cookie: reg })).json; expect(d.events.map((e: any) => e.kind)).toContain('created');
  });
});

describe('bulk import', () => {
  const base = { institution_code: 'SYN-1001', programme: 'B.Tech ME', academic_year: '2026-27', category: 'General', status: 'Active' };
  const rows = [{ ...base, apaar_id: '700000000001', student_name: 'Rhea Kulkarni' }, { ...base, apaar_id: 'ABC', student_name: 'Bad Id' }, { ...base, apaar_id: '700000000002', student_name: '' }, { ...base, apaar_id: '700000000001', student_name: 'Rhea Kulkarni' }, { ...base, institution_code: 'SYN-1002', apaar_id: '700000000003', student_name: 'Other Inst' }, { ...base, apaar_id: '700000000004', student_name: 'Neel Rao', status: '' }];
  it('previews row-level errors and warnings without writing', async () => {
    const before = (await call('GET', '/enrolments', { cookie: adm })).json.total;
    const p = (await call('POST', '/imports/preview', { cookie: adm, body: { rows } })).json;
    expect(p.summary).toMatchObject({ total: 6, accepted: 2, rejected: 4, warnings: 1, outcome: 'partial' });
    expect(p.rows[4].errors[0]).toMatch(/Not authorised/); expect((await call('GET', '/enrolments', { cookie: adm })).json.total).toBe(before);
  });
  it('commits partially, persists, and blocks duplicate and re-formatted uploads', async () => {
    const r = await call('POST', '/imports', { cookie: adm, body: { filename: 'a.csv', rows } }); expect(r.status).toBe(200); expect(r.json).toMatchObject({ accepted: 2, rejected: 4, outcome: 'partial' });
    expect((await call('GET', '/enrolments', { cookie: adm, query: { q: '700000000001' } })).json.total).toBe(1);
    expect((await call('POST', '/imports', { cookie: adm, body: { filename: 'a.csv', rows } })).json.error.code).toBe('duplicate_import');
    expect((await call('POST', '/imports', { cookie: adm, body: { filename: 'b.csv', rows: [...rows].reverse().map(x => ({ ...x, student_name: ' ' + x.student_name })) } })).json.error.code).toBe('duplicate_import');
    const hist = (await call('GET', '/imports', { cookie: adm })).json.items; expect(hist[0]).toMatchObject({ filename: 'a.csv', accepted: 2, rejected: 4 });
    const job = (await call('GET', '/imports/' + hist[0].id, { cookie: adm })).json; expect(job.rows).toHaveLength(6);
  });
  it('rejects oversized files and unauthenticated roles', async () => {
    expect((await call('POST', '/imports/preview', { cookie: adm, body: { rows: Array(2001).fill(rows[0]) } })).status).toBe(400);
    expect((await call('POST', '/imports', { cookie: ver, body: { rows } })).status).toBe(403);
  });
});

describe('cases, versioning and revalidation', () => {
  it('enforces transitions, reasons and permissions on the server', async () => {
    const open = (await call('GET', '/cases', { cookie: reg, query: { status: 'Open', type: 'stale_status' } })).json.items[0];
    expect((await call('POST', `/cases/${open.id}/transition`, { cookie: staff, body: { to: 'Resolved', note: 'long enough reason' } })).status).toBe(403);
    expect((await call('POST', `/cases/${open.id}/transition`, { cookie: reg, body: { to: 'Resolved', note: 'short' } })).json.error.code).toBe('reason_required');
    expect((await call('POST', `/cases/${open.id}/transition`, { cookie: reg, body: { to: 'Assigned' } })).json.error.code).toBe('assignee_required');
    const d = (await call('GET', `/cases/${open.id}`, { cookie: reg })).json; expect((await call('POST', `/cases/${open.id}/transition`, { cookie: reg, body: { to: 'Assigned', assignee_id: d.officers[0].id } })).status).toBe(200);
    expect((await call('POST', `/cases/${open.id}/transition`, { cookie: reg, body: { to: 'Dismissed', note: 'Confirmed not a problem' } })).status).toBe(200);
    expect((await call('POST', `/cases/${open.id}/transition`, { cookie: reg, body: { to: 'Escalated', note: 'cannot escalate closed' } })).json.error.code).toBe('invalid_transition');
    expect((await call('POST', `/cases/${open.id}/transition`, { cookie: reg, body: { to: 'Open' } })).status).toBe(200);
    expect((await call('GET', `/cases/${open.id}`, { cookie: reg })).json.events.length).toBeGreaterThanOrEqual(4);
  });
  it('lets the institution answer a clarification request', async () => {
    const c = (await call('GET', '/cases', { cookie: reg, query: { status: 'Clarification Requested' } })).json.items[0];
    expect((await call('POST', `/cases/${c.id}/respond`, { cookie: adm, body: { note: 'Identifier corrected against the admission form.' } })).status).toBe(200);
    expect((await call('GET', `/cases/${c.id}`, { cookie: reg })).json.case.status).toBe('Under Review');
  });
  it('versions a change, detects conflicts, and revalidates affected cases', async () => {
    const f = (await call('GET', '/findings', { cookie: reg, query: { type: 'concurrent_enrolment', status: 'current' } })).json.items[0];
    const rec = f.evidence.records.find((r: any) => r.institution === 'SYN-1002'); const e = (await call('GET', '/enrolments/' + rec.id, { cookie: reg })).json.enrolment;
    expect((await call('PATCH', '/enrolments/' + rec.id, { cookie: reg, body: { changes: { status: 'Withdrawn' }, reason: 'short' } })).status).toBe(400);
    expect((await call('PATCH', '/enrolments/' + rec.id, { cookie: reg, body: { changes: { status: 'Withdrawn' }, reason: 'Institution confirmed withdrawal', expected_version: 99 } })).json.error.code).toBe('version_conflict');
    const r = await call('PATCH', '/enrolments/' + rec.id, { cookie: reg, body: { changes: { status: 'Withdrawn' }, reason: 'Institution confirmed withdrawal', expected_version: e.version } });
    expect(r.status).toBe(200); expect(r.json.impact.affected[0].outcome).toBe('cleared');
    const d = (await call('GET', '/enrolments/' + rec.id, { cookie: reg })).json; expect(d.enrolment.version).toBe(e.version + 1); expect(d.versions[0]).toMatchObject({ field: 'status', old_value: 'Active', new_value: 'Withdrawn' });
    const cs = (await call('GET', `/cases/${f.case_id}`, { cookie: reg })).json; expect(cs.case.status).toBe('Resolved'); expect(cs.events.some((x: any) => x.kind === 'revalidated')).toBe(true);
  });
  it('handles correction requests with separation of duties', async () => {
    const list = (await call('GET', '/corrections', { cookie: adm })).json; const pend = list.find((c: any) => c.status === 'pending');
    expect((await call('POST', `/corrections/${pend.id}/decide`, { cookie: staff, body: { approve: true, note: 'approved' } })).status).toBe(403);
    expect((await call('POST', `/corrections/${pend.id}/decide`, { cookie: adm, body: { approve: true, note: 'Approved after document check' } })).status).toBe(200);
    expect((await call('POST', `/corrections/${pend.id}/decide`, { cookie: adm, body: { approve: true, note: 'again please' } })).json.error.code).toBe('already_decided');
    expect((await call('GET', '/versions', { cookie: adm, query: { enrolment_id: pend.enrolment_id } })).json.items[0]).toMatchObject({ field: 'category', new_value: 'OBC' });
  });
});

describe('policy-as-code, simulation and crash tests', () => {
  it('simulates a draft without touching production, then walks the lifecycle', async () => {
    const rules = (await call('GET', '/rules', { cookie: reg })).json; const draft = rules.find((r: any) => r.key === 'intake-cap' && r.status === 'draft');
    const before = (await call('GET', '/findings', { cookie: reg, query: { pageSize: '100', status: 'current' } })).json.total;
    expect((await call('POST', `/rules/${draft.id}/transition`, { cookie: reg, body: { to: 'tested' } })).json.error.code).toBe('simulation_required');
    const s = (await call('POST', `/rules/${draft.id}/simulate`, { cookie: reg })).json; expect(s.removed.length).toBeGreaterThan(0); expect(s.records_evaluated).toBeGreaterThan(100);
    expect((await call('GET', '/findings', { cookie: reg, query: { pageSize: '100', status: 'current' } })).json.total).toBe(before);
    expect((await call('POST', `/rules/${draft.id}/transition`, { cookie: adm, body: { to: 'tested' } })).status).toBe(403);
    for (const to of ['tested', 'approved']) expect((await call('POST', `/rules/${draft.id}/transition`, { cookie: reg, body: { to } })).status).toBe(200);
    expect((await call('POST', `/rules/${draft.id}/transition`, { cookie: reg, body: { to: 'published' } })).status).toBe(200);
    const after = (await call('GET', '/rules', { cookie: reg })).json.filter((r: any) => r.key === 'intake-cap');
    expect(after.filter((r: any) => r.status === 'published')).toHaveLength(1); expect(after.find((r: any) => r.version === 1).status).toBe('retired');
    expect((await call('GET', '/integrity', { cookie: reg })).json.rows.find((r: any) => r.institution_code === 'SYN-1001' && r.programme === 'B.Tech CSE' && r.year === '2026-27').status).toBe('Within approved intake');
  });
  it('validates rule configuration and blocks arbitrary expressions', async () => {
    const bad = await call('POST', '/rules', { cookie: reg, body: { name: 'Evil rule', type: 'intake_cap', config: { expression: 'process.exit()' }, effective_date: '2026-11-01' } }); expect(bad.status).toBe(400);
    const good = await call('POST', '/rules', { cookie: reg, body: { name: 'Status freshness', key: 'stale-status', type: 'stale_status', config: { max_age_days: 90, statuses: ['Active'] }, effective_date: '2026-11-01' } }); expect(good.json.version).toBe(2);
  });
  it('computes crash-test metrics from actual execution', async () => {
    const t = (await call('POST', '/tests/run', { cookie: reg })).json; const m = t.metrics;
    expect(m.tp + m.fp + m.fn + m.tn).toBe(m.total_units); expect(m.precision).toBeGreaterThan(0.9); expect(m.recall).toBeGreaterThan(0.9); expect(m.false_positive_rate).toBeLessThan(0.1); expect(t.duration_ms).toBeGreaterThan(0);
    expect(t.scenarios.map((s: any) => s.scenario)).toEqual(expect.arrayContaining(['legitimate_transfer', 'similar_names_distinct_ids', 'upload_retry', 'duplicate_import']));
    expect((await call('GET', '/tests', { cookie: reg })).json[0].id).toBe(t.id); expect((await call('POST', '/tests/run', { cookie: adm })).status).toBe(403);
  });
});

describe('verification, quality, reports', () => {
  it('answers purpose-limited verification requests and supports revocation', async () => {
    const r = (await call('GET', '/enrolments', { cookie: reg, query: { institution_id: (await call('GET', '/institutions', { cookie: reg })).json[0].id } })).json.items[0];
    const v = await call('POST', '/verifications', { cookie: ver, body: { apaar_id: r.apaar_id, institution_code: r.institution_code, purpose: 'admission_confirmation' } });
    expect(v.json.match).toBe(true); expect(JSON.stringify(v.json)).not.toContain(r.name); expect(v.json.source).toMatch(/Not verified against APAAR/);
    expect((await call('POST', '/verifications', { cookie: ver, body: { apaar_id: '111', institution_code: 'X', purpose: 'admission_confirmation' } })).status).toBe(400);
    expect((await call('POST', `/verifications/${v.json.id}/revoke`, { cookie: ver })).status).toBe(403);
    expect((await call('POST', `/verifications/${v.json.id}/revoke`, { cookie: reg })).status).toBe(200);
    expect((await call('GET', '/verifications', { cookie: ver })).json[0].status).toBe('revoked');
  });
  it('computes data-quality metrics with denominators', async () => {
    const q = (await call('GET', '/quality', { cookie: reg })).json; const a = q.items.find((i: any) => i.code === 'SYN-1001');
    expect(a.import_rows).toBeGreaterThan(0); expect(a.completeness_pct).toBeLessThan(100); expect(q.definitions.timeliness).toMatch(/Active/); expect(q.period_days).toBe(365);
  });
  it('exports permission-checked CSV and neutralises spreadsheet formulas', async () => {
    const r = await call('GET', '/reports/enrolments', { cookie: adm, query: { format: 'csv' } }); expect(r.text!.split('\n').length).toBeGreaterThan(20); expect(r.text).not.toContain('SYN-1002');
    expect(toCsv([{ a: '=HYPERLINK("x")', b: 'ok' }])).toContain(`"'=HYPERLINK`); expect((await call('GET', '/reports/audit', { cookie: staff })).status).toBe(403);
  });
});

describe('evaluation workspace reset', () => {
  it('is restricted and restores the synthetic dataset', async () => {
    expect((await call('POST', '/eval/reset', { cookie: adm })).status).toBe(403);
    expect((await call('POST', '/eval/reset', { cookie: reg })).status).toBe(200);
    expect((await call('GET', '/institutions', { cookie: reg })).json).toHaveLength(3);
    expect((await call('GET', '/enrolments', { cookie: reg, query: { q: '700000000001' } })).json.total).toBe(0);
    expect((await call('GET', '/cases', { cookie: reg, query: { status: 'Resolved' } })).json.total).toBeGreaterThan(0);
    expect((await call('GET', '/me', { cookie: reg })).status).toBe(200);
  });
});

describe('production workspace bootstrap and administration', () => {
  let admin: string;
  it('bootstraps exactly one first administrator and never from public registration', async () => {
    expect((await call('POST', '/bootstrap', { body: { token: 'wrong-token-wrong-token', email: 'a@x.in', name: 'Asha', password: 'a-long-password-1' } })).status).toBe(403);
    const ok = await call('POST', '/bootstrap', { body: { token: 'bootstrap-token-for-tests-only', email: 'admin@example.in', name: 'Asha Admin', password: 'a-very-long-password' } }); expect(ok.status).toBe(200);
    expect((await call('POST', '/bootstrap', { body: { token: 'bootstrap-token-for-tests-only', email: 'x@example.in', name: 'Second', password: 'a-very-long-password' } })).json.error.code).toBe('already_bootstrapped');
    expect((await call('POST', '/auth/login', { body: { email: 'admin@example.in', password: 'wrong-password' } })).status).toBe(401);
    admin = (await call('POST', '/auth/login', { body: { email: 'admin@example.in', password: 'a-very-long-password' } })).cookie!; expect((await call('GET', '/me', { cookie: admin })).json.user.role).toBe('security_admin');
  });
  it('isolates the production workspace from evaluation data and enforces admin rules', async () => {
    expect((await call('GET', '/institutions', { cookie: admin })).status).toBe(403);
    expect((await call('GET', '/export/database', { cookie: admin })).json.tables.find((t: any) => t.table === 'institutions').rows).toBe(0);
    const me = (await call('GET', '/me', { cookie: admin })).json.user.id;
    expect((await call('PATCH', '/users/' + me, { cookie: admin, body: { role: 'verifier' } })).json.error.code).toBe('self_change');
    const n = await call('POST', '/users', { cookie: admin, body: { email: 'v@example.in', name: 'Vera Verifier', role: 'verifier', password: 'another-long-password' } }); expect(n.status).toBe(200);
    expect((await call('PATCH', '/users/' + n.json.id, { cookie: admin, body: { role: 'security_admin' } })).status).toBe(200);
    expect((await call('GET', '/audit', { cookie: admin })).json.items.some((a: any) => a.action === 'user.update')).toBe(true);
    expect((await call('GET', '/integrations', { cookie: admin })).json.items.every((i: any) => i.status === 'Not configured')).toBe(true);
  });
});
