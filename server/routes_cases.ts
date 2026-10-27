import { z } from 'zod';
import { R, parse, page, type Ctx } from './http.js';
import { tx } from './db.js';
import { HttpError, can, scopeSql, audit } from './auth.js';
import { maskId } from './engine.js';
import { reconcile, transitionCase } from './services.js';
import { integrityRows } from './routes_core.js';

const ref = `'CASE-'||lpad(c.seq::text,4,'0')`;
const inScope = (u: any, p: any[]) => { const s = scopeSql(u, p, 'i'); return s ? ` and exists(select 1 from institutions i where i.id=any(f.institution_ids)${s})` : ''; };
function maskEvidence(u: any, ev: any) { if (u.role !== 'state_officer') return ev; return { ...ev, records: ev.records.map((r: any) => ({ ...r, apaar: maskId(r.apaar.replace(/\*/g, '0')).replace(/0+/g, m => '*'.repeat(m.length)) })) }; }

R('GET', '/findings', 'case:view', async ({ u, db, q }: Ctx) => {
  const pg = page(q), p: any[] = [u.workspace_id]; let w = inScope(u, p);
  if (q.type) { p.push(q.type.split(',')); w += ` and f.type=any($${p.length})`; }
  if (q.status) { p.push(q.status); w += ` and f.status=$${p.length}`; }
  const total = (await db.query(`select count(*)::int n from findings f join cases c on c.finding_id=f.id where f.workspace_id=$1${w}`, p)).rows[0].n; p.push(pg.pageSize, pg.offset);
  const items = (await db.query(`select f.id,f.type,f.severity,f.status finding_status,f.rule_key,f.rule_version,f.academic_year,f.calculation,f.recommendation,f.evidence,c.id case_id,${ref} case_ref,c.status case_status from findings f join cases c on c.finding_id=f.id where f.workspace_id=$1${w} order by (f.status='current') desc,f.updated_at desc limit $${p.length - 1} offset $${p.length}`, p)).rows;
  return { items: items.map((i: any) => ({ ...i, evidence: maskEvidence(u, i.evidence) })), total, ...pg };
});
R('GET', '/cases', 'case:view', async ({ u, db, q }: Ctx) => {
  const pg = page(q), p: any[] = [u.workspace_id]; let w = inScope(u, p);
  for (const [k, col] of [['status', 'c.status'], ['severity', 'c.severity'], ['type', 'f.type']] as const) if (q[k]) { p.push(q[k]); w += ` and ${col}=$${p.length}`; }
  if (q.open === '1') w += ` and c.status not in('Resolved','Dismissed')`;
  if (q.q) { p.push(q.q); w += ` and c.title ilike '%'||$${p.length}||'%'`; }
  const total = (await db.query(`select count(*)::int n from cases c join findings f on f.id=c.finding_id where c.workspace_id=$1${w}`, p)).rows[0].n; p.push(pg.pageSize, pg.offset);
  const items = (await db.query(`select c.id,${ref} ref,c.status,c.severity,c.title,f.type,f.academic_year,a.name assignee,c.updated_at from cases c join findings f on f.id=c.finding_id left join users a on a.id=c.assignee_id where c.workspace_id=$1${w} order by (c.status in('Resolved','Dismissed')),case c.severity when 'High' then 0 when 'Medium' then 1 else 2 end,c.updated_at desc limit $${p.length - 1} offset $${p.length}`, p)).rows;
  return { items, total, ...pg };
});
async function caseFor(u: any, db: any, id: string) {
  const p: any[] = [u.workspace_id, id]; const w = inScope(u, p);
  const c = (await db.query(`select c.*,${ref} ref,f.type,f.rule_key,f.rule_version,f.evidence,f.calculation,f.recommendation,f.academic_year,f.status finding_status,f.institution_ids,a.name assignee from cases c join findings f on f.id=c.finding_id left join users a on a.id=c.assignee_id where c.workspace_id=$1 and c.id=$2${w}`, p)).rows[0];
  if (!c) throw new HttpError(404, 'not_found', 'Case not found or outside your scope.'); return c;
}
R('GET', '/cases/:id', 'case:view', async ({ u, db, params }: Ctx) => {
  const c = await caseFor(u, db, params.id), internal = can(u, 'case:manage');
  const events = (await db.query(`select actor_name,kind,from_status,to_status,note,meta,created_at from case_events where case_id=$1 ${internal ? '' : `and kind<>'note'`} order by id`, [c.id])).rows;
  const officers = internal ? (await db.query(`select id,name from users where workspace_id=$1 and role='regulator' and active`, [u.workspace_id])).rows : [];
  return { case: { ...c, evidence: maskEvidence(u, c.evidence) }, events, officers };
});
R('POST', '/cases/:id/transition', 'case:manage', async ({ u, params, body, db }: Ctx) => {
  const b = parse(z.object({ to: z.enum(['Open', 'Assigned', 'Clarification Requested', 'Under Review', 'Escalated', 'Resolved', 'Dismissed']), note: z.string().max(1000).optional(), assignee_id: z.string().uuid().optional() }), body);
  await caseFor(u, db, params.id); await tx(d => transitionCase(d, u, params.id, b.to, b.note, b.assignee_id)); return { ok: true };
});
R('POST', '/cases/:id/note', 'case:manage', async ({ u, params, body, db }: Ctx) => {
  const b = parse(z.object({ note: z.string().trim().min(3).max(1000) }), body); const c = await caseFor(u, db, params.id);
  await db.query(`insert into case_events(case_id,workspace_id,actor_id,actor_name,kind,note) values($1,$2,$3,$4,'note',$5)`, [c.id, u.workspace_id, u.id, u.name, b.note]); await audit(db, u, 'case.note', 'case', c.id, null); return { ok: true };
});
R('POST', '/cases/:id/respond', 'case:respond', async ({ u, params, body, db }: Ctx) => {
  const b = parse(z.object({ note: z.string().trim().min(10, 'Response must be at least 10 characters').max(1000) }), body); const c = await caseFor(u, db, params.id);
  if (c.status !== 'Clarification Requested') throw new HttpError(409, 'not_awaiting_response', 'This case is not awaiting an institution response.');
  await tx(async d => {
    const r = await d.query(`update cases set status='Under Review',updated_at=now() where id=$1 and status='Clarification Requested'`, [c.id]); if (!r.rowCount) throw new HttpError(409, 'concurrent_update', 'Case changed; reload.');
    await d.query(`insert into case_events(case_id,workspace_id,actor_id,actor_name,kind,from_status,to_status,note) values($1,$2,$3,$4,'institution_response','Clarification Requested','Under Review',$5)`, [c.id, u.workspace_id, u.id, u.name, b.note]);
    await audit(d, u, 'case.respond', 'case', c.id, u.institution_id);
  }); return { ok: true };
});
R('POST', '/reconcile', 'reconcile', async ({ u }: Ctx) => { const d = await tx(async x => { const r = await reconcile(x, u, 'manual'); await audit(x, u, 'reconcile.run', 'workspace', u.workspace_id, null, { trigger: 'manual' }); return r; }); return { ok: true, new_cases: d.new.length, persisting: d.persisting.length, cleared: d.cleared.length, reopened: d.reopened.length, current: d.total_current }; });

R('GET', '/changes', 'case:view', async ({ u, db, q }: Ctx) => {
  const pg = page(q), p: any[] = [u.workspace_id]; const s = scopeSql(u, p);
  const items = (await db.query(`select ce.id,ce.created_at,ce.actor_name,ce.reason,ce.source,ce.fields,ce.impact,e.id enrolment_id,i.code institution_code,e.academic_year from change_events ce join enrolments e on e.id=ce.enrolment_id join institutions i on i.id=e.institution_id where ce.workspace_id=$1${s} order by ce.created_at desc limit ${pg.pageSize} offset ${pg.offset}`, p)).rows;
  return { items, ...pg };
});
R('GET', '/versions', 'case:view', async ({ u, db, q }: Ctx) => {
  const pg = page(q), p: any[] = [u.workspace_id]; let s = scopeSql(u, p); if (q.enrolment_id) { p.push(q.enrolment_id); s += ` and rv.enrolment_id=$${p.length}`; }
  const items = (await db.query(`select rv.id,rv.enrolment_id,rv.version,rv.field,rv.old_value,rv.new_value,rv.reason,rv.actor_name,rv.source,rv.created_at,i.code institution_code,e.academic_year from record_versions rv join enrolments e on e.id=rv.enrolment_id join institutions i on i.id=e.institution_id where rv.workspace_id=$1${s} order by rv.id desc limit ${pg.pageSize} offset ${pg.offset}`, p)).rows;
  return { items, ...pg };
});

R('GET', '/overview', 'case:view', async ({ u, db }: Ctx) => {
  const p: any[] = [u.workspace_id]; const s = scopeSql(u, p), fw = inScope(u, [...p]);
  const ep: any[] = [u.workspace_id]; const es = scopeSql(u, ep);
  const e = (await db.query(`select count(*)::int total,count(*) filter(where e.status='Active')::int active,count(distinct e.institution_id)::int institutions from enrolments e join institutions i on i.id=e.institution_id where e.workspace_id=$1${es}`, ep)).rows[0];
  const cp: any[] = [u.workspace_id]; const cw = inScope(u, cp);
  const cs = (await db.query(`select c.status,c.severity,f.type,count(*)::int n from cases c join findings f on f.id=c.finding_id where c.workspace_id=$1${cw} group by 1,2,3`, cp)).rows;
  const openRows = cs.filter((r: any) => !['Resolved', 'Dismissed'].includes(r.status)), sum = (rs: any[]) => rs.reduce((a, r) => a + r.n, 0);
  const ig = await integrityRows(db, u);
  const byType: Record<string, number> = {}; openRows.forEach((r: any) => (byType[r.type] = (byType[r.type] ?? 0) + r.n));
  const ip: any[] = [u.workspace_id]; const is = u.role === 'regulator' ? '' : ` and j.institution_id=$2`; if (is) ip.push(u.institution_id);
  const imports = (await db.query(`select j.id,j.filename,j.status,j.accepted,j.rejected,j.created_at from import_jobs j where j.workspace_id=$1${is} order by created_at desc limit 5`, ip)).rows;
  void s; void fw;
  return { enrolments: e, cases: { open: sum(openRows), high: sum(openRows.filter((r: any) => r.severity === 'High')), resolved: sum(cs.filter((r: any) => r.status === 'Resolved')), by_type: byType }, intake: { approved: ig.rows.reduce((a: number, r: any) => a + r.approved, 0), regular: ig.rows.reduce((a: number, r: any) => a + r.regular, 0), rows: ig.rows.map((r: any) => ({ label: `${r.institution_code} ${r.programme.replace('B.Tech ', '')} ${r.year}`, approved: r.approved, regular: r.regular, institution_id: r.institution_id, year: r.year })) }, imports };
});
