import { z } from 'zod';
import crypto from 'node:crypto';
import { R, parse, page, type Ctx, type PubCtx } from './http.js';
import { tx } from './db.js';
import { HttpError, PERMS, ROLE_LABEL, can, scopeSql, scopedInstitutionId, hashPassword, verifyPassword, makeSession, cookieHeader, rateLimit, audit, type Role } from './auth.js';
import { env } from './env.js';
import { ensureEvalWorkspace, resetEvalWorkspace } from './seed.js';
import { maskId, CATEGORIES, STATUSES, FIELDS } from './engine.js';
import { reconcile, validateImport, importSummary, commitImport, changeEnrolment, transitionCase, loadData, publishedRules, EDITABLE } from './services.js';

const EVAL_ROLES = ['regulator', 'inst_admin', 'inst_staff', 'state_officer', 'verifier'] as const;
const ok = (x: any = {}) => ({ status: 200, json: { ok: true, ...x } });
const mask = (u: { role: Role }, a: string) => (u.role === 'state_officer' ? maskId(a) : a);

// ---------- Public / session ----------
R('GET', '/health', 'public', async () => ({ status: 'ok', time: new Date().toISOString() }));
R('GET', '/ready', 'public', async ({ db }: PubCtx) => { await db.query('select 1'); const m = (await db.query('select count(*)::int n from schema_migrations')).rows[0].n; return { status: 'ready', database: 'connected', migrations: m }; });
R('POST', '/eval/start', 'public', async ({ db, body, ip }: PubCtx) => {
  if (env().ENABLE_EVALUATION_WORKSPACE !== 'true') throw new HttpError(404, 'disabled', 'The Evaluation Workspace is not enabled on this deployment.');
  const { role } = parse(z.object({ role: z.enum(EVAL_ROLES) }), body);
  await rateLimit(db, 'eval:' + ip, 40, 3600);
  const ws = await tx(d => ensureEvalWorkspace(d));
  const u = (await db.query('select id from users where workspace_id=$1 and role=$2 and active', [ws, role])).rows[0];
  if (!u) throw new HttpError(503, 'workspace_unavailable', 'The Evaluation Workspace is not ready. Please retry.');
  return { status: 200, json: { ok: true }, cookie: cookieHeader(makeSession(u.id, 8)) };
});
R('POST', '/auth/login', 'public', async ({ db, body, ip }: PubCtx) => {
  const b = parse(z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), workspace: z.string().max(50).default('primary') }), body);
  await rateLimit(db, `login:${ip}:${b.email.toLowerCase()}`, 8, 900);
  const r = (await db.query(`select u.id,u.password_hash from users u join workspaces w on w.id=u.workspace_id where w.slug=$1 and lower(u.email)=lower($2) and u.active`, [b.workspace, b.email])).rows[0];
  if (!r || !(await verifyPassword(b.password, r.password_hash))) throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');
  return { status: 200, json: { ok: true }, cookie: cookieHeader(makeSession(r.id)) };
});
R('POST', '/auth/logout', 'public', async () => ({ status: 200, json: { ok: true }, cookie: cookieHeader('', 0) }));
R('POST', '/bootstrap', 'public', async ({ db, body, ip }: PubCtx) => {
  const t = env().BOOTSTRAP_TOKEN; if (!t) throw new HttpError(404, 'disabled', 'Bootstrap is disabled: BOOTSTRAP_TOKEN is not set.');
  await rateLimit(db, 'boot:' + ip, 5, 3600);
  const b = parse(z.object({ token: z.string(), email: z.string().email(), name: z.string().min(2).max(100), password: z.string().min(12).max(200) }), body);
  const a = Buffer.from(b.token), c = Buffer.from(t); if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) throw new HttpError(403, 'forbidden', 'Invalid bootstrap token.');
  const hash = await hashPassword(b.password);
  await tx(async d => {
    await d.query('select pg_advisory_xact_lock(727003)');
    await d.query(`insert into workspaces(slug,name,kind) values('primary','Production workspace','production') on conflict do nothing`);
    const ws = (await d.query(`select id from workspaces where slug='primary'`)).rows[0].id;
    if ((await d.query('select 1 from users where workspace_id=$1', [ws])).rowCount) throw new HttpError(409, 'already_bootstrapped', 'The first administrator already exists.');
    const u = (await d.query(`insert into users(workspace_id,email,name,role,password_hash) values($1,$2,$3,'security_admin',$4) returning id`, [ws, b.email, b.name, hash])).rows[0];
    await audit(d, { id: u.id, name: b.name, role: 'security_admin', workspace_id: ws }, 'bootstrap.first_admin', 'user', u.id, null);
  });
  return ok();
});
R('GET', '/me', 'auth', async ({ u }: Ctx) => ({ user: { id: u.id, name: u.name, email: u.email, role: u.role, role_label: ROLE_LABEL[u.role], institution_id: u.institution_id, state: u.state }, workspace: { kind: u.kind }, permissions: PERMS[u.role] }));
R('POST', '/eval/reset', 'record:edit', async ({ u, db }: Ctx) => {
  if (u.kind !== 'evaluation') throw new HttpError(403, 'forbidden', 'Reset is only available in the Evaluation Workspace.');
  await rateLimit(db, 'reset:' + u.workspace_id, 3, 600);
  await tx(d => resetEvalWorkspace(d, u.workspace_id)); return ok();
});

// ---------- Institutions, programmes, approvals ----------
R('GET', '/institutions', 'auth', async ({ u, db }: Ctx) => {
  if (u.role === 'verifier' || u.role === 'security_admin') throw new HttpError(403, 'forbidden', 'Not permitted.');
  const p: any[] = [u.workspace_id]; const s = scopeSql(u, p);
  return (await db.query(`select i.id,i.code,i.name,i.state,i.synthetic,(select count(*)::int from programmes x where x.institution_id=i.id) programmes,(select count(*)::int from enrolments e where e.institution_id=i.id) enrolments from institutions i where i.workspace_id=$1${s} order by i.code`, p)).rows;
});
R('POST', '/institutions', 'institution:manage', async ({ u, db, body }: Ctx) => {
  const b = parse(z.object({ code: z.string().trim().min(3).max(30).regex(/^[A-Z0-9-]+$/, 'Use capital letters, digits and hyphens'), name: z.string().trim().min(3).max(200), state: z.string().trim().min(2).max(60) }), body);
  const r = await db.query('insert into institutions(workspace_id,code,name,state,synthetic) values($1,$2,$3,$4,$5) returning id', [u.workspace_id, b.code, b.name, b.state, u.kind === 'evaluation']);
  await audit(db, u, 'institution.create', 'institution', r.rows[0].id, r.rows[0].id, b); return ok({ id: r.rows[0].id });
});
R('GET', '/programmes', 'auth', async ({ u, db, q }: Ctx) => {
  const p: any[] = [u.workspace_id]; let s = scopeSql(u, p);
  if (q.institution_id) { p.push(q.institution_id); s += ` and i.id=$${p.length}`; }
  return (await db.query(`select pr.id programme_id,pr.name programme,i.id institution_id,i.code institution_code,i.name institution,a.id approval_id,a.academic_year,a.approved_intake,a.reference,a.effective_from::text effective_from
    from programmes pr join institutions i on i.id=pr.institution_id left join approvals a on a.programme_id=pr.id where pr.workspace_id=$1${s} order by i.code,pr.name,a.academic_year`, p)).rows;
});
R('POST', '/programmes', 'institution:manage', async ({ u, db, body }: Ctx) => {
  const b = parse(z.object({ institution_id: z.string().uuid(), name: z.string().trim().min(3).max(100) }), body);
  const i = await db.query('select 1 from institutions where id=$1 and workspace_id=$2', [b.institution_id, u.workspace_id]); if (!i.rowCount) throw new HttpError(404, 'not_found', 'Institution not found.');
  const r = await db.query('insert into programmes(workspace_id,institution_id,name) values($1,$2,$3) returning id', [u.workspace_id, b.institution_id, b.name]);
  await audit(db, u, 'programme.create', 'programme', r.rows[0].id, b.institution_id, b); return ok({ id: r.rows[0].id });
});
R('PUT', '/approvals', 'institution:manage', async ({ u, db, body }: Ctx) => {
  const b = parse(z.object({ programme_id: z.string().uuid(), academic_year: z.string().regex(/^\d{4}-\d{2}$/, 'Use format 2026-27'), approved_intake: z.number().int().min(0).max(100000), reference: z.string().trim().min(3).max(100), effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), body);
  const pr = (await db.query('select institution_id from programmes where id=$1 and workspace_id=$2', [b.programme_id, u.workspace_id])).rows[0]; if (!pr) throw new HttpError(404, 'not_found', 'Programme not found.');
  const out = await tx(async d => {
    await d.query(`insert into approvals(workspace_id,programme_id,academic_year,approved_intake,reference,effective_from) values($1,$2,$3,$4,$5,$6) on conflict(programme_id,academic_year) do update set approved_intake=excluded.approved_intake,reference=excluded.reference,effective_from=excluded.effective_from,updated_at=now()`, [u.workspace_id, b.programme_id, b.academic_year, b.approved_intake, b.reference, b.effective_from]);
    await audit(d, u, 'approval.upsert', 'programme', b.programme_id, pr.institution_id, b); return reconcile(d, u, 'approval-change');
  });
  return ok({ new_cases: out.new.length, cleared: out.cleared.length });
});

// ---------- Student records ----------
R('GET', '/enrolments', 'auth', async ({ u, db, q }: Ctx) => {
  const pg = page(q), p: any[] = [u.workspace_id]; let w = scopeSql(u, p);
  const f = (col: string, v?: string) => { if (v) { p.push(v); w += ` and ${col}=$${p.length}`; } };
  f('e.institution_id', q.institution_id); f('e.academic_year', q.year); f('e.status', q.status); f('e.category', q.category); f('e.programme_id', q.programme_id);
  if (q.q) { p.push(q.q.trim()); w += ` and (s.apaar_id like $${p.length}||'%' or e.reported_name ilike '%'||$${p.length}||'%')`; }
  const total = (await db.query(`select count(*)::int n from enrolments e join students s on s.id=e.student_id join institutions i on i.id=e.institution_id where e.workspace_id=$1${w}`, p)).rows[0].n;
  p.push(pg.pageSize, pg.offset);
  const items = (await db.query(`select e.id,s.apaar_id,e.reported_name name,i.code institution_code,pr.name programme,e.academic_year,e.category,e.status,e.version,to_char(e.reported_at,'YYYY-MM-DD') reported_at
    from enrolments e join students s on s.id=e.student_id join institutions i on i.id=e.institution_id join programmes pr on pr.id=e.programme_id where e.workspace_id=$1${w} order by e.updated_at desc,e.id limit $${p.length - 1} offset $${p.length}`, p)).rows;
  return { items: items.map((r: any) => ({ ...r, apaar_id: mask(u, r.apaar_id) })), total, ...pg };
});
async function enrolmentScoped(u: any, db: any, id: string) {
  const p: any[] = [u.workspace_id, id]; const s = scopeSql(u, p);
  const r = (await db.query(`select e.*,s.apaar_id from enrolments e join students s on s.id=e.student_id join institutions i on i.id=e.institution_id where e.workspace_id=$1 and e.id=$2${s}`, p)).rows[0];
  if (!r) throw new HttpError(404, 'not_found', 'Record not found or outside your scope.'); return r;
}
R('GET', '/enrolments/:id', 'auth', async ({ u, db, params }: Ctx) => {
  const e = await enrolmentScoped(u, db, params.id), p: any[] = [u.workspace_id, e.student_id]; const s = scopeSql(u, p);
  const history = (await db.query(`select e.id,i.code institution_code,pr.name programme,e.academic_year,e.category,e.status,e.version,to_char(e.reported_at,'YYYY-MM-DD') reported_at from enrolments e join institutions i on i.id=e.institution_id join programmes pr on pr.id=e.programme_id where e.workspace_id=$1 and e.student_id=$2${s} order by e.academic_year,i.code`, p)).rows;
  const versions = (await db.query('select version,field,old_value,new_value,reason,actor_name,source,created_at from record_versions where enrolment_id=$1 order by id desc', [e.id])).rows;
  const cases = (await db.query(`select c.id,'CASE-'||lpad(c.seq::text,4,'0') ref,c.status,c.title from findings f join cases c on c.finding_id=f.id where f.workspace_id=$1 and f.evidence @> $2::jsonb`, [u.workspace_id, JSON.stringify({ records: [{ id: e.id }] })])).rows;
  return { enrolment: { id: e.id, apaar_id: mask(u, e.apaar_id), name: e.reported_name, academic_year: e.academic_year, category: e.category, status: e.status, version: e.version, source: e.source }, history, versions, cases };
});
R('PATCH', '/enrolments/:id', 'record:edit', async ({ u, db, params, body }: Ctx) => {
  const b = parse(z.object({ changes: z.object({ status: z.enum(STATUSES).optional(), category: z.enum(CATEGORIES).optional(), reported_name: z.string().trim().min(2).max(200).optional() }).strict(), reason: z.string().trim().min(10, 'Give a reason of at least 10 characters').max(500), expected_version: z.number().int().optional() }), body);
  await enrolmentScoped(u, db, params.id);
  return ok(await tx(d => changeEnrolment(d, u, params.id, b.changes as Record<string, string>, b.reason, 'manual_edit', b.expected_version)));
});

// ---------- Bulk import ----------
const rowSchema = z.object(Object.fromEntries(FIELDS.map(f => [f, z.string().max(300).optional()]))).strip();
const importBody = z.object({ filename: z.string().trim().min(1).max(200).default('upload.csv'), rows: z.array(rowSchema).min(1).max(2000), mapping: z.record(z.string()).optional() });
R('POST', '/imports/preview', 'import', async ({ u, db, body }: Ctx) => {
  const b = parse(importBody, body); const v = await validateImport(db, u, b.rows as any);
  const dup = await db.query(`select id from import_jobs where workspace_id=$1 and file_hash=$2 and status<>'rejected' and coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid)`, [u.workspace_id, v.hash, u.role === 'regulator' ? null : u.institution_id]);
  return { summary: importSummary(v.results), already_imported: !!dup.rowCount, rows: v.results.map(r => ({ row_no: r.row_no, status: r.status, data: r.data, errors: r.errors, warnings: r.warnings })) };
});
R('POST', '/imports', 'import', async ({ u, body }: Ctx) => { const b = parse(importBody, body); return ok(await tx(d => commitImport(d, u, b.filename, b.rows as any, b.mapping))); });
R('GET', '/imports', 'import', async ({ u, db, q }: Ctx) => {
  const pg = page(q), p: any[] = [u.workspace_id]; let w = ''; if (u.role !== 'regulator') { p.push(u.institution_id); w = ` and j.institution_id=$2`; }
  const total = (await db.query(`select count(*)::int n from import_jobs j where j.workspace_id=$1${w}`, p)).rows[0].n; p.push(pg.pageSize, pg.offset);
  const items = (await db.query(`select j.id,j.filename,j.status,j.total,j.accepted,j.rejected,j.warnings,j.created_at,i.code institution_code,u.name created_by from import_jobs j left join institutions i on i.id=j.institution_id left join users u on u.id=j.created_by where j.workspace_id=$1${w} order by j.created_at desc limit $${p.length - 1} offset $${p.length}`, p)).rows;
  return { items, total, ...pg };
});
R('GET', '/imports/:id', 'import', async ({ u, db, params }: Ctx) => {
  const j = (await db.query('select * from import_jobs where id=$1 and workspace_id=$2', [params.id, u.workspace_id])).rows[0];
  if (!j || (u.role !== 'regulator' && j.institution_id !== u.institution_id)) throw new HttpError(404, 'not_found', 'Import not found.');
  return { job: { ...j, file_hash: undefined }, rows: (await db.query('select row_no,status,issues,data from import_rows where job_id=$1 order by row_no limit 2100', [j.id])).rows };
});

// ---------- Admission integrity ----------
export async function integrityRows(db: any, u: any) {
  const [rules, { enrs, apprs }] = [await publishedRules(db, u.workspace_id), await loadData(db, u.workspace_id)];
  const cap = rules.find((r: any) => r.type === 'intake_cap'); const c = cap?.config ?? { excluded_categories: ['TFWS', 'Lateral Entry'], counted_statuses: ['Active'], tolerance: 0 };
  const p: any[] = [u.workspace_id]; const s = scopeSql(u, p);
  const base = (await db.query(`select pr.id prog_id,pr.name programme,i.id institution_id,i.code institution_code,a.academic_year "year",a.approved_intake approved,a.reference,a.effective_from::text effective_from from approvals a join programmes pr on pr.id=a.programme_id join institutions i on i.id=pr.institution_id where a.workspace_id=$1${s} order by i.code,pr.name,a.academic_year`, p)).rows;
  const open = (await db.query(`select f.evidence->'records'->0->>'programme' prog,f.institution_ids[1] inst,f.academic_year y,count(*)::int n from findings f join cases c on c.finding_id=f.id where f.workspace_id=$1 and f.status='current' and c.status not in('Resolved','Dismissed') group by 1,2,3`, [u.workspace_id])).rows;
  return {
    rule: cap ? { key: cap.key, version: cap.version } : null,
    rows: base.map((b: any) => {
      const g = enrs.filter((e: any) => e.prog_id === b.prog_id && e.year === b.year && c.counted_statuses.includes(e.status));
      const reg = g.filter((e: any) => !c.excluded_categories.includes(e.category)).length, cats: Record<string, number> = {}; g.forEach((e: any) => (cats[e.category] = (cats[e.category] ?? 0) + 1));
      const fresh = enrs.filter((e: any) => e.prog_id === b.prog_id && e.year === b.year).map((e: any) => e.reported_at).sort().pop() ?? null;
      return { ...b, regular: reg, special: g.length - reg, variance: reg - b.approved, categories: cats, status: reg > b.approved + c.tolerance ? 'Exceeds approved intake' : 'Within approved intake', unresolved_cases: open.filter((o: any) => o.inst === b.institution_id && o.y === b.year && o.prog === b.programme).reduce((a: number, o: any) => a + o.n, 0), last_reported: fresh?.slice(0, 10) ?? null };
    }),
  };
}
R('GET', '/integrity', 'auth', async ({ u, db }: Ctx) => {
  scopeSql(u, []);
  const r = await integrityRows(db, u);
  const runs = (await db.query(`select id,trigger,started_at,stats from recon_runs where workspace_id=$1 and finished_at is not null order by started_at desc limit 15`, [u.workspace_id])).rows;
  return { ...r, runs };
});
