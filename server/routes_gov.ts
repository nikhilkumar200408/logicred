import { z } from 'zod';
import crypto from 'node:crypto';
import { R, parse, page, type Ctx } from './http.js';
import { tx } from './db.js';
import { HttpError, can, scopeSql, audit, hashPassword, rateLimit, ROLE_LABEL, type Role } from './auth.js';
import { maskId, RULE_TYPES, parseRuleConfig, simulate, runCrashTest, CATEGORIES, STATUSES } from './engine.js';
import { loadData, publishedRules, reconcile, changeEnrolment } from './services.js';

const ok = (x: any = {}) => ({ ok: true, ...x });
// ---------- Policy-as-code ----------
R('GET', '/rules', 'rule:read', async ({ u, db }: Ctx) => (await db.query(`select r.id,r.key,r.version,r.name,r.description,r.type,r.config,r.status,r.effective_date::text effective_date,r.owner,r.created_at,r.published_at,c.name created_by,p.name published_by,(select count(*)::int from simulations s where s.rule_id=r.id) simulations from policy_rules r left join users c on c.id=r.created_by left join users p on p.id=r.published_by where r.workspace_id=$1 order by r.key,r.version desc`, [u.workspace_id])).rows);
const ruleBody = z.object({ key: z.string().regex(/^[a-z0-9-]{3,60}$/, 'Lowercase letters, digits and hyphens').optional(), name: z.string().trim().min(3).max(120), description: z.string().max(500).default(''), type: z.enum(RULE_TYPES as [string, ...string[]]), config: z.unknown(), effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), owner: z.string().trim().min(2).max(120).default('AICTE Regulatory Cell') });
R('POST', '/rules', 'rule:draft', async ({ u, body, db }: Ctx) => {
  const b = parse(ruleBody, body); let config; try { config = parseRuleConfig(b.type, b.config); } catch (e: any) { throw new HttpError(400, 'invalid_config', 'Rule configuration is invalid for this rule type.', e.issues?.map((i: any) => ({ field: i.path.join('.'), message: i.message }))); }
  const key = b.key ?? b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const r = await tx(async d => {
    const prev = (await d.query('select type,max(version) v from policy_rules where workspace_id=$1 and key=$2 group by type', [u.workspace_id, key])).rows[0];
    if (prev && prev.type !== b.type) throw new HttpError(400, 'type_mismatch', 'A new version must keep the same rule type.');
    const row = (await d.query(`insert into policy_rules(workspace_id,key,version,name,description,type,config,status,effective_date,owner,created_by) values($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10) returning id,version`, [u.workspace_id, key, (prev?.v ?? 0) + 1, b.name, b.description, b.type, JSON.stringify(config), b.effective_date, b.owner, u.id])).rows[0];
    await audit(d, u, 'rule.draft', 'rule', row.id, null, { key, version: row.version }); return row;
  });
  return ok(r);
});
R('PUT', '/rules/:id', 'rule:draft', async ({ u, body, params, db }: Ctx) => {
  const b = parse(ruleBody.pick({ name: true, description: true, config: true, effective_date: true }), body);
  const r = (await db.query('select type,status from policy_rules where id=$1 and workspace_id=$2', [params.id, u.workspace_id])).rows[0];
  if (!r) throw new HttpError(404, 'not_found', 'Rule not found.'); if (r.status !== 'draft') throw new HttpError(409, 'not_draft', 'Only draft rules can be edited. Create a new version instead.');
  let config; try { config = parseRuleConfig(r.type, b.config); } catch (e: any) { throw new HttpError(400, 'invalid_config', 'Rule configuration is invalid.', e.issues?.map((i: any) => ({ field: i.path.join('.'), message: i.message }))); }
  await db.query('update policy_rules set name=$1,description=$2,config=$3,effective_date=$4 where id=$5', [b.name, b.description, JSON.stringify(config), b.effective_date, params.id]); await audit(db, u, 'rule.edit', 'rule', params.id, null); return ok();
});
async function candidateRules(db: any, ws: string, rule: any) { const pub = await publishedRules(db, ws); return [...pub.filter((r: any) => r.key !== rule.key), { key: rule.key, version: rule.version, type: rule.type, config: rule.config }]; }
R('POST', '/rules/:id/simulate', 'simulate', async ({ u, db, params }: Ctx) => {
  const rule = (await db.query('select * from policy_rules where id=$1 and workspace_id=$2', [params.id, u.workspace_id])).rows[0]; if (!rule) throw new HttpError(404, 'not_found', 'Rule not found.');
  const { enrs, apprs } = await loadData(db, u.workspace_id), base = await publishedRules(db, u.workspace_id), cand = await candidateRules(db, u.workspace_id, rule);
  const res = simulate(enrs, apprs, base, cand, new Date());
  const id = (await db.query('insert into simulations(workspace_id,rule_id,rule_key,draft_config,baseline,result,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id', [u.workspace_id, rule.id, rule.key, JSON.stringify(rule.config), JSON.stringify(base.map((r: any) => r.key + ' v' + r.version)), JSON.stringify(res), u.id])).rows[0].id;
  await audit(db, u, 'rule.simulate', 'rule', rule.id, null, { added: res.added.length, removed: res.removed.length });
  return { id, ...res, note: 'Simulation ran in memory on current persisted data. Production findings, cases and published rules were not changed.' };
});
R('GET', '/simulations', 'simulate', async ({ u, db }: Ctx) => (await db.query(`select s.id,s.rule_key,r.version,s.result,s.created_at,u.name created_by from simulations s left join policy_rules r on r.id=s.rule_id left join users u on u.id=s.created_by where s.workspace_id=$1 order by s.created_at desc limit 20`, [u.workspace_id])).rows);
R('POST', '/rules/:id/transition', 'auth', async ({ u, db, params, body }: Ctx) => {
  const b = parse(z.object({ to: z.enum(['tested', 'approved', 'published', 'retired']) }), body);
  const need = b.to === 'tested' ? 'simulate' : 'rule:publish'; if (!can(u, need)) throw new HttpError(403, 'forbidden', 'Your role cannot perform this rule transition.');
  await tx(async d => {
    const r = (await d.query('select * from policy_rules where id=$1 and workspace_id=$2 for update', [params.id, u.workspace_id])).rows[0]; if (!r) throw new HttpError(404, 'not_found', 'Rule not found.');
    const allowed: Record<string, string[]> = { draft: ['tested', 'retired'], tested: ['approved', 'retired'], approved: ['published', 'retired'], published: ['retired'], retired: [] };
    if (!allowed[r.status].includes(b.to)) throw new HttpError(409, 'invalid_transition', `A ${r.status} rule cannot move to ${b.to}. Order: draft, tested, approved, published.`);
    if (b.to === 'tested' && !(await d.query('select 1 from simulations where rule_id=$1', [r.id])).rowCount) throw new HttpError(409, 'simulation_required', 'Run the Rule Impact Simulator at least once before marking a rule tested.');
    if (b.to === 'published') { await d.query(`update policy_rules set status='retired' where workspace_id=$1 and key=$2 and status='published'`, [u.workspace_id, r.key]); await d.query(`update policy_rules set status='published',published_by=$1,published_at=now() where id=$2`, [u.id, r.id]); }
    else await d.query(`update policy_rules set status=$1,approved_by=case when $1='approved' then $3::uuid else approved_by end where id=$2`, [b.to, r.id, u.id]);
    await audit(d, u, 'rule.' + b.to, 'rule', r.id, null, { key: r.key, version: r.version });
    if (b.to === 'published' || (b.to === 'retired' && r.status === 'published')) await reconcile(d, u, `rule:${r.key}:v${r.version}:${b.to}`);
  }); return ok();
});

// ---------- Crash-test lab ----------
R('POST', '/tests/run', 'tests:run', async ({ u, db }: Ctx) => {
  const rules = await publishedRules(db, u.workspace_id); if (!rules.length) throw new HttpError(409, 'no_rules', 'No published rules to test.');
  const r = runCrashTest(rules);
  const id = (await db.query('insert into test_runs(workspace_id,created_by,metrics,scenarios,duration_ms) values($1,$2,$3,$4,$5) returning id', [u.workspace_id, u.id, JSON.stringify(r.metrics), JSON.stringify(r.scenarios), r.duration_ms])).rows[0].id;
  await audit(db, u, 'tests.run', 'test_run', id, null, r.metrics); return { id, ...r, rules: rules.map((x: any) => `${x.key} v${x.version}`) };
});
R('GET', '/tests', 'tests:run', async ({ u, db }: Ctx) => (await db.query('select t.id,t.metrics,t.scenarios,t.duration_ms,t.created_at,u.name created_by from test_runs t left join users u on u.id=t.created_by where t.workspace_id=$1 order by t.created_at desc limit 10', [u.workspace_id])).rows);

// ---------- Data quality ----------
R('GET', '/quality', 'report', async ({ u, db, q }: Ctx) => {
  const days = Math.min(1825, Math.max(7, +q.days || 365)), ip: any[] = [u.workspace_id]; const s = scopeSql(u, ip);
  const rules = await publishedRules(db, u.workspace_id), maxAge = rules.find((r: any) => r.type === 'stale_status')?.config.max_age_days ?? 180;
  const insts = (await db.query(`select i.id,i.code,i.name from institutions i where i.workspace_id=$1${s} order by i.code`, ip)).rows;
  const imp = (await db.query(`select j.institution_id,count(*)::int total,count(*) filter(where r.status='rejected')::int rejected,count(*) filter(where r.issues::text ilike '%Missing%')::int missing from import_rows r join import_jobs j on j.id=r.job_id where r.workspace_id=$1 and j.created_at>now()-($2||' days')::interval group by 1`, [u.workspace_id, String(days)])).rows;
  const en = (await db.query(`select institution_id,count(*) filter(where status='Active')::int active,count(*) filter(where status='Active' and reported_at>now()-($2||' days')::interval)::int timely,coalesce(round(percentile_cont(0.5) within group(order by extract(epoch from now()-reported_at)/86400))::int,0) median_age from enrolments where workspace_id=$1 group by 1`, [u.workspace_id, String(maxAge)])).rows;
  const oc = (await db.query(`select unnest(f.institution_ids) inst,count(*)::int n from cases c join findings f on f.id=c.finding_id where c.workspace_id=$1 and c.status not in('Resolved','Dismissed') group by 1`, [u.workspace_id])).rows;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return { period_days: days, from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), timeliness_limit_days: maxAge, items: insts.map((i: any) => { const a = imp.find((x: any) => x.institution_id === i.id) ?? { total: 0, rejected: 0, missing: 0 }, b = en.find((x: any) => x.institution_id === i.id) ?? { active: 0, timely: 0, median_age: 0 };
    return { institution_id: i.id, code: i.code, name: i.name, import_rows: a.total, completeness_pct: pct(a.total - a.missing, a.total), validation_error_rate_pct: pct(a.rejected, a.total), active_enrolments: b.active, timely_reporting_pct: pct(b.timely, b.active), median_record_age_days: b.median_age, unresolved_cases: oc.find((x: any) => x.inst === i.id)?.n ?? 0 }; }),
    definitions: { completeness: 'Import rows in the period without a missing-field error / all import rows in the period', validation_error_rate: 'Rejected import rows / all import rows in the period', timeliness: `Active enrolments reported within ${maxAge} days / all Active enrolments`, freshness: 'Median days since each enrolment was last reported' } };
});

// ---------- Reports & exports ----------
const csvCell = (v: any) => { let s = v == null ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
export const toCsv = (rows: any[]) => { if (!rows.length) return ''; const k = Object.keys(rows[0]); return [k.join(','), ...rows.map(r => k.map(c => csvCell(r[c])).join(','))].join('\n'); };
R('GET', '/reports/:kind', 'report', async ({ u, db, q, params }: Ctx) => {
  const p: any[] = [u.workspace_id]; let w = scopeSql(u, p), rows: any[];
  if (q.year) { p.push(q.year); w += ` and X.academic_year=$${p.length}`; }
  const kind = params.kind;
  if (kind === 'enrolments') rows = (await db.query(`select s.apaar_id,e.reported_name student_name,i.code institution_code,pr.name programme,e.academic_year,e.category,e.status,e.version,to_char(e.reported_at,'YYYY-MM-DD') reported_at from enrolments e join students s on s.id=e.student_id join institutions i on i.id=e.institution_id join programmes pr on pr.id=e.programme_id where e.workspace_id=$1${w.replace(/X\./g, 'e.')} order by i.code,e.academic_year limit 20000`, p)).rows.map((r: any) => ({ ...r, apaar_id: u.role === 'state_officer' ? maskId(r.apaar_id) : r.apaar_id }));
  else if (kind === 'cases') { const p2: any[] = [u.workspace_id]; const s2 = scopeSql(u, p2, 'i'); rows = (await db.query(`select 'CASE-'||lpad(c.seq::text,4,'0') case_ref,c.status,c.severity,f.type,f.rule_key,f.rule_version,f.academic_year,f.calculation,f.recommendation,c.resolution_reason from cases c join findings f on f.id=c.finding_id where c.workspace_id=$1 ${s2 ? `and exists(select 1 from institutions i where i.id=any(f.institution_ids)${s2})` : ''} order by c.seq limit 20000`, p2)).rows; }
  else if (kind === 'imports') { if (u.role !== 'regulator' && !u.institution_id) throw new HttpError(403, 'forbidden', 'Not permitted.'); rows = (await db.query(`select j.filename,j.status,j.total,j.accepted,j.rejected,j.warnings,j.created_at from import_jobs j where j.workspace_id=$1 ${u.role === 'regulator' ? '' : 'and j.institution_id=$2'} order by j.created_at desc limit 5000`, u.role === 'regulator' ? [u.workspace_id] : [u.workspace_id, u.institution_id])).rows; }
  else if (kind === 'audit') { if (!can(u, 'audit:read')) throw new HttpError(403, 'forbidden', 'Not permitted.'); rows = (await auditQuery(u, db, {}, 5000)).items; }
  else throw new HttpError(404, 'unknown_report', 'Unknown report. Use enrolments, cases, imports or audit.');
  await audit(db, u, 'report.export', 'report', kind, u.institution_id, { rows: rows.length, format: q.format ?? 'json' });
  if (q.format === 'csv') return { status: 200, text: toCsv(rows), contentType: 'text/csv; charset=utf-8', filename: `logicred-${kind}.csv` };
  return { kind, count: rows.length, rows: rows.slice(0, 500) };
});
const DB_TABLES = ['institutions', 'programmes', 'approvals', 'students', 'enrolments', 'import_jobs', 'import_rows', 'policy_rules', 'recon_runs', 'findings', 'cases', 'case_events', 'change_events', 'record_versions', 'simulations', 'test_runs', 'verification_requests', 'correction_requests', 'audit_events', 'integration_events'];
R('GET', '/export/database', 'export:db', async ({ u, db, q }: Ctx) => {
  if (!q.table) { const out: any[] = []; for (const t of DB_TABLES) out.push({ table: t, rows: (await db.query(`select count(*)::int n from ${t} where workspace_id=$1`, [u.workspace_id])).rows[0].n }); await audit(db, u, 'export.manifest', 'database', null, null); return { tables: out, note: 'Download tables individually (JSON). For a full physical backup use the database provider tools (see README).' }; }
  if (!DB_TABLES.includes(q.table)) throw new HttpError(400, 'bad_table', 'Unknown table.');
  const rows = (await db.query(`select * from ${q.table} where workspace_id=$1 limit 50000`, [u.workspace_id])).rows; await audit(db, u, 'export.table', 'database', q.table, null, { rows: rows.length });
  return { status: 200, text: JSON.stringify(rows), contentType: 'application/json', filename: `logicred-${q.table}.json` };
});

// ---------- Verification gateway ----------
const PURPOSES = ['admission_confirmation', 'scholarship_eligibility', 'employment_screening', 'higher_study_application'] as const;
R('POST', '/verifications', 'verification:create', async ({ u, db, body }: Ctx) => {
  const b = parse(z.object({ apaar_id: z.string().regex(/^\d{12}$/, 'Identifier must be 12 digits'), institution_code: z.string().trim().toUpperCase().min(3).max(30), purpose: z.enum(PURPOSES) }), body);
  await rateLimit(db, 'verify:' + u.id, 30, 3600);
  const rows = (await db.query(`select pr.name programme,e.academic_year,e.status from enrolments e join students s on s.id=e.student_id join institutions i on i.id=e.institution_id join programmes pr on pr.id=e.programme_id where e.workspace_id=$1 and s.apaar_id=$2 and i.code=$3 order by e.academic_year desc`, [u.workspace_id, b.apaar_id, b.institution_code])).rows;
  const result = { match: rows.length > 0, enrolments: rows, scope: 'Purpose-limited: programme, year and status only. Name and other institutions are never returned.', source: 'Records held in this workspace. Not verified against APAAR, ABC, DigiLocker or AICTE systems.' };
  const r = (await db.query(`insert into verification_requests(workspace_id,requester_id,apaar_masked,apaar_hash,institution_code,purpose,status,result,expires_at) values($1,$2,$3,$4,$5,$6,'answered',$7,now()+interval '7 days') returning id,expires_at`, [u.workspace_id, u.id, maskId(b.apaar_id), crypto.createHash('sha256').update(b.apaar_id).digest('hex'), b.institution_code, b.purpose, JSON.stringify(result)])).rows[0];
  await audit(db, u, 'verification.request', 'verification', r.id, null, { purpose: b.purpose, match: result.match }); return { id: r.id, expires_at: r.expires_at, ...result };
});
R('GET', '/verifications', 'auth', async ({ u, db }: Ctx) => {
  if (!can(u, 'verification:create') && !can(u, 'verification:manage')) throw new HttpError(403, 'forbidden', 'Not permitted.');
  const all = can(u, 'verification:manage');
  return (await db.query(`select v.id,v.apaar_masked,v.institution_code,v.purpose,case when v.status='answered' and v.expires_at<now() then 'expired' else v.status end status,v.result,v.expires_at,v.created_at,u.name requester from verification_requests v left join users u on u.id=v.requester_id where v.workspace_id=$1 ${all ? '' : 'and v.requester_id=$2'} order by v.created_at desc limit 100`, all ? [u.workspace_id] : [u.workspace_id, u.id])).rows;
});
R('POST', '/verifications/:id/revoke', 'verification:manage', async ({ u, db, params }: Ctx) => {
  const r = await db.query(`update verification_requests set status='revoked',result=jsonb_build_object('match',null,'revoked',true) where id=$1 and workspace_id=$2 and status='answered'`, [params.id, u.workspace_id]);
  if (!r.rowCount) throw new HttpError(404, 'not_found', 'Active verification not found.'); await audit(db, u, 'verification.revoke', 'verification', params.id, null); return ok();
});

// ---------- Correction requests ----------
R('GET', '/corrections', 'auth', async ({ u, db }: Ctx) => {
  if (!can(u, 'correction:create') && !can(u, 'correction:decide')) throw new HttpError(403, 'forbidden', 'Not permitted.');
  const p: any[] = [u.workspace_id]; const s = scopeSql(u, p);
  return (await db.query(`select c.id,c.field,c.new_value,c.reason,c.status,c.requester_name,c.decided_by,c.decision_note,c.created_at,c.enrolment_id,i.code institution_code,e.academic_year,e.reported_name student_name,e.status current_status,e.category current_category from correction_requests c join enrolments e on e.id=c.enrolment_id join institutions i on i.id=e.institution_id where c.workspace_id=$1${s} order by (c.status='pending') desc,c.created_at desc limit 200`, p)).rows;
});
R('POST', '/corrections', 'correction:create', async ({ u, db, body }: Ctx) => {
  const b = parse(z.object({ enrolment_id: z.string().uuid(), field: z.enum(['status', 'category', 'reported_name']), new_value: z.string().trim().min(2).max(200), reason: z.string().trim().min(10, 'Give a reason of at least 10 characters').max(500) }), body);
  if (b.field === 'status' && !(STATUSES as readonly string[]).includes(b.new_value)) throw new HttpError(400, 'validation_error', 'Invalid status value.');
  if (b.field === 'category' && !(CATEGORIES as readonly string[]).includes(b.new_value)) throw new HttpError(400, 'validation_error', 'Invalid category value.');
  const e = (await db.query('select institution_id,status,category,reported_name from enrolments where id=$1 and workspace_id=$2', [b.enrolment_id, u.workspace_id])).rows[0];
  if (!e || e.institution_id !== u.institution_id) throw new HttpError(404, 'not_found', 'Enrolment not found in your institution.');
  if ((e as any)[b.field] === b.new_value) throw new HttpError(400, 'no_change', 'The requested value equals the current value.');
  const r = (await db.query(`insert into correction_requests(workspace_id,enrolment_id,requested_by,requester_name,field,new_value,reason,status) values($1,$2,$3,$4,$5,$6,$7,'pending') returning id`, [u.workspace_id, b.enrolment_id, u.id, u.name, b.field, b.new_value, b.reason])).rows[0];
  await audit(db, u, 'correction.request', 'correction', r.id, u.institution_id, { field: b.field }); return ok({ id: r.id });
});
R('POST', '/corrections/:id/decide', 'correction:decide', async ({ u, db, params, body }: Ctx) => {
  const b = parse(z.object({ approve: z.boolean(), note: z.string().trim().min(5).max(500) }), body);
  await tx(async d => {
    const c = (await d.query(`select c.*,e.institution_id from correction_requests c join enrolments e on e.id=c.enrolment_id where c.id=$1 and c.workspace_id=$2 for update of c`, [params.id, u.workspace_id])).rows[0];
    if (!c || (u.role !== 'regulator' && c.institution_id !== u.institution_id)) throw new HttpError(404, 'not_found', 'Correction request not found.');
    if (c.status !== 'pending') throw new HttpError(409, 'already_decided', 'This request has already been decided.');
    if (c.requested_by === u.id) throw new HttpError(403, 'self_approval', 'You cannot decide your own request.');
    if (b.approve) await changeEnrolment(d, u, c.enrolment_id, { [c.field]: c.new_value }, `Correction request approved: ${c.reason}`, 'correction_request');
    await d.query('update correction_requests set status=$1,decided_by=$2,decision_note=$3,decided_at=now() where id=$4', [b.approve ? 'applied' : 'rejected', u.name, b.note, c.id]);
    await audit(d, u, b.approve ? 'correction.apply' : 'correction.reject', 'correction', c.id, c.institution_id);
  }); return ok();
});

// ---------- Users & access ----------
R('GET', '/users', 'user:read', async ({ u, db }: Ctx) => (await db.query(`select u.id,u.email,u.name,u.role,u.active,i.code institution_code,u.state,u.created_at from users u left join institutions i on i.id=u.institution_id where u.workspace_id=$1 order by u.role,u.name`, [u.workspace_id])).rows.map((r: any) => ({ ...r, role_label: ROLE_LABEL[r.role as Role] })));
const ROLES = ['regulator', 'inst_admin', 'inst_staff', 'state_officer', 'verifier', 'security_admin'] as const;
R('POST', '/users', 'user:manage', async ({ u, db, body }: Ctx) => {
  const b = parse(z.object({ email: z.string().email().max(200), name: z.string().trim().min(2).max(100), role: z.enum(ROLES), institution_id: z.string().uuid().optional(), state: z.string().max(60).optional(), password: z.string().min(12, 'Use at least 12 characters').max(200) }), body);
  if (u.kind === 'evaluation') throw new HttpError(403, 'forbidden', 'Users cannot be created in the Evaluation Workspace.');
  if (b.role.startsWith('inst_') && !b.institution_id) throw new HttpError(400, 'validation_error', 'Institution users require an institution.');
  if (b.role === 'state_officer' && !b.state) throw new HttpError(400, 'validation_error', 'State officers require a state.');
  const r = await db.query('insert into users(workspace_id,email,name,role,institution_id,state,password_hash) values($1,$2,$3,$4,$5,$6,$7) returning id', [u.workspace_id, b.email, b.name, b.role, b.institution_id ?? null, b.state ?? null, await hashPassword(b.password)]);
  await audit(db, u, 'user.create', 'user', r.rows[0].id, b.institution_id ?? null, { role: b.role }); return ok({ id: r.rows[0].id });
});
R('PATCH', '/users/:id', 'user:manage', async ({ u, db, params, body }: Ctx) => {
  const b = parse(z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional(), institution_id: z.string().uuid().nullable().optional(), state: z.string().max(60).nullable().optional() }), body);
  if (params.id === u.id) throw new HttpError(403, 'self_change', 'You cannot change your own role or status.');
  await tx(async d => {
    const t = (await d.query('select * from users where id=$1 and workspace_id=$2 for update', [params.id, u.workspace_id])).rows[0]; if (!t) throw new HttpError(404, 'not_found', 'User not found.');
    const next = { role: b.role ?? t.role, active: b.active ?? t.active, institution_id: b.institution_id === undefined ? t.institution_id : b.institution_id, state: b.state === undefined ? t.state : b.state };
    if (t.role === 'security_admin' && (next.role !== 'security_admin' || !next.active) && (await d.query(`select count(*)::int n from users where workspace_id=$1 and role='security_admin' and active and id<>$2`, [u.workspace_id, t.id])).rows[0].n === 0) throw new HttpError(409, 'last_admin', 'At least one active Platform Security Administrator must remain.');
    await d.query('update users set role=$1,active=$2,institution_id=$3,state=$4 where id=$5', [next.role, next.active, next.institution_id, next.state, t.id]);
    await audit(d, u, 'user.update', 'user', t.id, null, { from: { role: t.role, active: t.active }, to: { role: next.role, active: next.active } });
  }); return ok();
});

// ---------- Audit & integrations ----------
async function auditQuery(u: any, db: any, q: Record<string, string>, limit: number, offset = 0) {
  const p: any[] = [u.workspace_id]; let w = '';
  if (u.role === 'inst_admin') { p.push(u.institution_id); w = ` and a.institution_id=$2`; }
  else if (u.role === 'state_officer') { p.push(u.state); w = ` and a.institution_id in(select id from institutions where state=$2)`; }
  if (q.action) { p.push(q.action + '%'); w += ` and a.action like $${p.length}`; }
  const total = (await db.query(`select count(*)::int n from audit_events a where a.workspace_id=$1${w}`, p)).rows[0].n;
  const items = (await db.query(`select a.id,a.created_at,a.actor_name,a.actor_role,a.action,a.target_type,a.target_id,a.detail from audit_events a where a.workspace_id=$1${w} order by a.id desc limit ${limit} offset ${offset}`, p)).rows;
  return { items, total };
}
R('GET', '/audit', 'audit:read', async ({ u, db, q }: Ctx) => { const pg = page(q); return { ...(await auditQuery(u, db, q, pg.pageSize, pg.offset)), ...pg }; });
const INTEGRATIONS = [['APAAR', 'APAAR_API_URL'], ['ABC (Academic Bank of Credits)', 'ABC_API_URL'], ['DigiLocker', 'DIGILOCKER_API_URL'], ['AICTE approval data', 'AICTE_API_URL'], ['Institutional ERP', 'ERP_API_URL']];
R('GET', '/integrations', 'integration:read', async ({ u, db }: Ctx) => ({
  items: INTEGRATIONS.map(([name, v]) => ({ name, status: process.env[v] ? 'Credentials present, adapter not implemented' : 'Not configured', detail: 'No authorised integration is active. CSV and Excel import is the supported data path.' })),
  history: (await db.query('select integration,status,message,created_at from integration_events where workspace_id=$1 order by id desc limit 20', [u.workspace_id])).rows,
}));
