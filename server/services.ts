import type { Db } from './db.js';
import { HttpError, audit, type User } from './auth.js';
import { evaluate, validateRow, importFingerprint, FIELDS, type Enr, type Appr, type Rule, type RowIn, type Finding } from './engine.js';
import { env } from './env.js';

export type Actor = Pick<User, 'id' | 'name' | 'role' | 'workspace_id'>;
export const SYSTEM = (workspace_id: string): Actor => ({ id: null as any, name: 'System', role: 'regulator', workspace_id });
const TS = (c: string) => `to_char(${c} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

export async function publishedRules(db: Db, ws: string): Promise<Rule[]> {
  return (await db.query(`select key,version,type,config from policy_rules where workspace_id=$1 and status='published' order by key`, [ws])).rows;
}
export async function loadData(db: Db, ws: string): Promise<{ enrs: Enr[]; apprs: Appr[] }> {
  const enrs = (await db.query(`select e.id,s.apaar_id apaar,e.reported_name "name",e.institution_id inst_id,i.code inst_code,e.programme_id prog_id,p.name prog,e.academic_year "year",e.category,e.status,${TS('e.reported_at')} reported_at
    from enrolments e join students s on s.id=e.student_id join institutions i on i.id=e.institution_id join programmes p on p.id=e.programme_id where e.workspace_id=$1`, [ws])).rows;
  const apprs = (await db.query(`select programme_id prog_id,academic_year "year",approved_intake approved,reference from approvals where workspace_id=$1`, [ws])).rows;
  return { enrs, apprs };
}

const LABEL: Record<string, string> = { intake_excess: 'Intake exceeds approval', missing_approval: 'Missing approval reference', concurrent_enrolment: 'Concurrent enrolment', identity_mismatch: 'Identity mismatch', stale_status: 'Stale enrolment status' };
export const findingTitle = (f: Finding) => { const r = f.evidence.records[0]; return `${LABEL[f.type]} · ${f.type === 'concurrent_enrolment' || f.type === 'identity_mismatch' ? r.apaar : r.institution + ' ' + r.programme} · ${f.year}`; };
async function caseEvent(db: Db, ws: string, caseId: string, actor: Pick<Actor, 'id' | 'name'>, kind: string, from: string | null, to: string | null, note: string | null, meta?: unknown) {
  await db.query('insert into case_events(case_id,workspace_id,actor_id,actor_name,kind,from_status,to_status,note,meta) values($1,$2,$3,$4,$5,$6,$7,$8,$9)', [caseId, ws, actor.id, actor.name, kind, from, to, note, meta ? JSON.stringify(meta) : null]);
}

export type ReconDiff = { run_id: string; new: string[]; persisting: string[]; cleared: string[]; reopened: string[]; total_current: number };
/** Re-run published rules over persisted data; sync findings and cases; preserve history. */
export async function reconcile(db: Db, actor: Actor, trigger: string, changeEventId: string | null = null): Promise<ReconDiff> {
  const ws = actor.workspace_id;
  const [rules, { enrs, apprs }] = [await publishedRules(db, ws), await loadData(db, ws)];
  const run = (await db.query('insert into recon_runs(workspace_id,triggered_by,trigger,change_event_id) values($1,$2,$3,$4) returning id', [ws, actor.id, trigger, changeEventId])).rows[0].id;
  const found = evaluate(enrs, apprs, rules, new Date());
  const ex = new Map<string, any>((await db.query(`select f.id,f.finding_key,f.status,c.id case_id,c.status case_status from findings f join cases c on c.finding_id=f.id where f.workspace_id=$1`, [ws])).rows.map((r: any) => [r.finding_key, r]));
  const d: ReconDiff = { run_id: run, new: [], persisting: [], cleared: [], reopened: [], total_current: found.length };
  const seen = new Set<string>();
  for (const f of found) {
    seen.add(f.key); const e = ex.get(f.key);
    const vals = [f.rule_key, f.rule_version, f.severity, JSON.stringify(f.evidence), f.calculation, f.recommendation, run];
    if (!e) {
      const fid = (await db.query(`insert into findings(workspace_id,finding_key,type,rule_key,rule_version,severity,status,institution_ids,academic_year,evidence,calculation,recommendation,first_run_id,last_run_id)
        values($1,$2,$3,$4,$5,$6,'current',$7,$8,$9,$10,$11,$12,$12) returning id`, [ws, f.key, f.type, f.rule_key, f.rule_version, f.severity, f.institution_ids, f.year, JSON.stringify(f.evidence), f.calculation, f.recommendation, run])).rows[0].id;
      const c = (await db.query(`insert into cases(workspace_id,finding_id,status,severity,title) values($1,$2,'Open',$3,$4) returning id,seq`, [ws, fid, f.severity, findingTitle(f)])).rows[0];
      await caseEvent(db, ws, c.id, actor, 'created', null, 'Open', `Raised by rule ${f.rule_key} v${f.rule_version}`, { run_id: run, change_event_id: changeEventId });
      d.new.push(c.id);
    } else {
      await db.query(`update findings set status='current',rule_key=$1,rule_version=$2,severity=$3,evidence=$4,calculation=$5,recommendation=$6,last_run_id=$7,cleared_run_id=null,cleared_by_change=null,updated_at=now() where id=$8`, [...vals, e.id]);
      if (e.status === 'cleared') {
        await db.query(`update cases set status='Open',resolution_reason=null,severity=$1,updated_at=now() where id=$2`, [f.severity, e.case_id]);
        await caseEvent(db, ws, e.case_id, actor, 'reopened', e.case_status, 'Open', 'Finding reappeared after revalidation', { run_id: run, change_event_id: changeEventId });
        d.reopened.push(e.case_id);
      } else { await db.query('update cases set severity=$1 where id=$2 and status not in($3,$4)', [f.severity, e.case_id, 'Resolved', 'Dismissed']); d.persisting.push(e.case_id); }
    }
  }
  for (const [k, e] of ex) if (!seen.has(k) && e.status === 'current') {
    await db.query(`update findings set status='cleared',cleared_run_id=$1,cleared_by_change=$2,updated_at=now() where id=$3`, [run, changeEventId, e.id]);
    if (!['Resolved', 'Dismissed'].includes(e.case_status)) {
      await db.query(`update cases set status='Resolved',resolution_reason='Cleared by revalidation: current rules and data no longer produce this finding',updated_at=now() where id=$1`, [e.case_id]);
      await caseEvent(db, ws, e.case_id, actor, 'revalidated', e.case_status, 'Resolved', 'Finding cleared by revalidation (prior outcome preserved in history)', { run_id: run, change_event_id: changeEventId });
    }
    d.cleared.push(e.case_id);
  }
  await db.query('update recon_runs set finished_at=now(),stats=$1 where id=$2', [JSON.stringify({ new: d.new.length, persisting: d.persisting.length, cleared: d.cleared.length, reopened: d.reopened.length, current: found.length, records: enrs.length }), run]);
  return d;
}

// ---------- Bulk import ----------
export const MAX_IMPORT_ROWS = 2000;
async function importRefs(db: Db, ws: string, scopeInst: string | null, apaars: string[]) {
  const insts = new Map((await db.query('select id,code from institutions where workspace_id=$1', [ws])).rows.map((r: any) => [r.code, { id: r.id }]));
  const progs = new Map((await db.query('select p.id,p.name,i.code from programmes p join institutions i on i.id=p.institution_id where p.workspace_id=$1', [ws])).rows.map((r: any) => [r.code + '|' + r.name, r.id]));
  const existing = new Set((await db.query(`select s.apaar_id,i.code,p.name,e.academic_year y from enrolments e join students s on s.id=e.student_id join institutions i on i.id=e.institution_id join programmes p on p.id=e.programme_id where e.workspace_id=$1 and s.apaar_id=any($2)`, [ws, apaars])).rows.map((r: any) => [r.apaar_id, r.code, r.name, r.y].join('|')));
  const ap = new Set((await db.query('select programme_id,academic_year from approvals where workspace_id=$1', [ws])).rows.map((r: any) => r.programme_id + '|' + r.academic_year));
  return { insts, progs, existing, scopeInst, hasApproval: (p: string, y: string) => ap.has(p + '|' + y) };
}
export async function validateImport(db: Db, user: User, rows: RowIn[]) {
  if (!rows.length) throw new HttpError(400, 'empty', 'The file contains no data rows.');
  if (rows.length > MAX_IMPORT_ROWS) throw new HttpError(413, 'too_many_rows', `A single import may contain at most ${MAX_IMPORT_ROWS} rows. Split the file and import in parts.`);
  const rules = await publishedRules(db, user.workspace_id);
  const apaars = rows.map(r => (r.apaar_id ?? '').toString().replace(/[\s-]/g, ''));
  const refs = await importRefs(db, user.workspace_id, user.role === 'regulator' ? null : user.institution_id, apaars);
  const seen = new Set<string>();
  const results = rows.map((r, i) => { const v = validateRow(r, rules, refs, seen); return { row_no: i + 2, ...v, status: v.errors.length ? 'rejected' : v.warnings.length ? 'warning' : 'accepted', data: v.norm }; });
  return { results, refs, hash: importFingerprint(rows) };
}
export function importSummary(results: { status: string }[]) {
  const rejected = results.filter(r => r.status === 'rejected').length, warnings = results.filter(r => r.status === 'warning').length;
  return { total: results.length, accepted: results.length - rejected, rejected, warnings, outcome: rejected === 0 ? 'complete' : rejected === results.length ? 'rejected' : 'partial' };
}
export async function commitImport(db: Db, user: User, filename: string, rows: RowIn[], mapping: unknown) {
  const ws = user.workspace_id;
  const v = await validateImport(db, user, rows), sum = importSummary(v.results), good = v.results.filter(r => r.status !== 'rejected');
  if (user.role !== 'regulator' && !user.institution_id) throw new HttpError(403, 'forbidden', 'Your account is not linked to an institution.');
  const dup = await db.query(`select id from import_jobs where workspace_id=$1 and coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce($2::uuid,'00000000-0000-0000-0000-000000000000'::uuid) and file_hash=$3 and status<>'rejected'`, [ws, user.role === 'regulator' ? null : user.institution_id, v.hash]);
  if (dup.rowCount) throw new HttpError(409, 'duplicate_import', 'This file content has already been imported. Duplicate imports are blocked.', { job_id: dup.rows[0].id });
  if (sum.outcome !== 'rejected' && user.kind === 'evaluation') { const n = (await db.query('select count(*)::int n from enrolments where workspace_id=$1', [ws])).rows[0].n; if (n + good.length > env().EVAL_ROW_CAP) throw new HttpError(429, 'capacity', `The Evaluation Workspace is limited to ${env().EVAL_ROW_CAP} enrolments. Reset the workspace to continue.`); }
  const instScope = user.role === 'regulator' ? null : user.institution_id;
  const job = (await db.query(`insert into import_jobs(workspace_id,institution_id,filename,file_hash,status,total,accepted,rejected,warnings,mapping,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [ws, instScope, filename.slice(0, 200), v.hash, sum.outcome === 'complete' ? 'completed' : sum.outcome, sum.total, sum.accepted, sum.rejected, sum.warnings, JSON.stringify(mapping ?? {}), user.id])).rows[0].id;
  await db.query(`insert into import_rows(job_id,workspace_id,row_no,status,issues,data) select $1,$2,x.row_no,x.status,x.issues,x.data from jsonb_to_recordset($3::jsonb) as x(row_no int,status text,issues jsonb,data jsonb)`,
    [job, ws, JSON.stringify(v.results.map(r => ({ row_no: r.row_no, status: r.status, issues: [...r.errors.map(m => ({ level: 'error', message: m })), ...r.warnings.map(m => ({ level: 'warning', message: m }))], data: r.data })))]);
  let diff: ReconDiff | null = null;
  if (good.length) {
    await db.query(`insert into students(workspace_id,apaar_id,name) select distinct on (x.apaar) $1,x.apaar,x.name from jsonb_to_recordset($2::jsonb) as x(apaar text,name text) on conflict(workspace_id,apaar_id) do nothing`, [ws, JSON.stringify(good.map(r => ({ apaar: r.norm.apaar_id, name: r.norm.student_name })))]);
    await db.query(`insert into enrolments(workspace_id,student_id,institution_id,programme_id,academic_year,reported_name,category,status,source,import_job_id)
      select $1,s.id,x.inst::uuid,x.prog::uuid,x.year,x.name,x.cat,x.status,'import',$3 from jsonb_to_recordset($2::jsonb) as x(apaar text,inst text,prog text,year text,name text,cat text,status text) join students s on s.workspace_id=$1 and s.apaar_id=x.apaar`,
      [ws, JSON.stringify(good.map(r => ({ apaar: r.norm.apaar_id, inst: r.instId, prog: r.progId, year: r.norm.academic_year, name: r.norm.student_name, cat: r.norm.category, status: r.norm.status }))), job]);
    diff = await reconcile(db, user, 'import:' + job);
  }
  await audit(db, user, 'import.commit', 'import_job', job, instScope, { filename, ...sum });
  return { job_id: job, ...sum, reconciliation: diff && { new_cases: diff.new.length, cleared: diff.cleared.length, reopened: diff.reopened.length } };
}

// ---------- Versioned record changes with revalidation ----------
export const EDITABLE: Record<string, string> = { status: 'status', category: 'category', reported_name: 'reported_name' };
export async function changeEnrolment(db: Db, actor: Actor & { institution_id?: string | null }, id: string, patch: Record<string, string>, reason: string, source: string, expectedVersion?: number) {
  const ws = actor.workspace_id;
  const cur = (await db.query('select * from enrolments where id=$1 and workspace_id=$2 for update', [id, ws])).rows[0];
  if (!cur) throw new HttpError(404, 'not_found', 'Enrolment not found.');
  if (expectedVersion !== undefined && expectedVersion !== cur.version) throw new HttpError(409, 'version_conflict', `This record was changed by someone else (current version ${cur.version}). Reload and try again.`);
  const fields = Object.keys(patch).filter(f => EDITABLE[f] && patch[f] !== cur[f]);
  if (!fields.length) throw new HttpError(400, 'no_change', 'No field value differs from the current record.');
  const nv = cur.version + 1;
  for (const f of fields) await db.query('update enrolments set ' + EDITABLE[f] + '=$1 where id=$2', [patch[f], id]);
  await db.query('update enrolments set version=$1,updated_at=now(),reported_at=now() where id=$2', [nv, id]);
  const before = (await db.query(`select f.id,f.finding_key,c.id case_id,c.seq from findings f join cases c on c.finding_id=f.id where f.workspace_id=$1 and f.status='current' and f.evidence @> $2::jsonb`, [ws, JSON.stringify({ records: [{ id }] })])).rows;
  const ce = (await db.query('insert into change_events(workspace_id,enrolment_id,actor_id,actor_name,reason,source,fields) values($1,$2,$3,$4,$5,$6,$7) returning id', [ws, id, actor.id, actor.name, reason, source, fields])).rows[0].id;
  for (const f of fields) await db.query('insert into record_versions(workspace_id,enrolment_id,version,field,old_value,new_value,reason,actor_name,source,change_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [ws, id, nv, f, cur[f], patch[f], reason, actor.name, source, ce]);
  const d = await reconcile(db, actor, 'change:' + ce, ce);
  const touched = new Set([...d.cleared, ...d.persisting, ...d.reopened, ...d.new]);
  const affected = before.map((b: any) => ({ case_id: b.case_id, case_ref: 'CASE-' + String(b.seq).padStart(4, '0'), finding_key: b.finding_key, outcome: d.cleared.includes(b.case_id) ? 'cleared' : d.persisting.includes(b.case_id) ? 'still_present' : 'changed' }));
  for (const a of affected) if (a.outcome === 'still_present') await caseEvent(db, ws, a.case_id, actor, 'revalidated', null, null, `Revalidated after change to ${fields.join(', ')}: finding still present`, { change_event_id: ce });
  const impact = { affected, new_cases: d.new, reopened: d.reopened, run_id: d.run_id };
  await db.query('update change_events set impact=$1 where id=$2', [JSON.stringify(impact), ce]);
  await audit(db, actor as any, 'record.change', 'enrolment', id, cur.institution_id, { fields, reason, version: nv });
  return { version: nv, change_event_id: ce, impact, touched: touched.size };
}

// ---------- Case workflow ----------
export const TRANSITIONS: Record<string, string[]> = {
  Open: ['Assigned', 'Clarification Requested', 'Under Review', 'Escalated', 'Resolved', 'Dismissed'],
  Assigned: ['Open', 'Under Review', 'Clarification Requested', 'Escalated', 'Resolved', 'Dismissed'],
  'Clarification Requested': ['Under Review', 'Escalated', 'Resolved', 'Dismissed'],
  'Under Review': ['Assigned', 'Clarification Requested', 'Escalated', 'Resolved', 'Dismissed'],
  Escalated: ['Under Review', 'Resolved', 'Dismissed'],
  Resolved: ['Open'], Dismissed: ['Open'],
};
export async function transitionCase(db: Db, user: User, caseId: string, to: string, note: string | undefined, assigneeId?: string) {
  const c = (await db.query('select * from cases where id=$1 and workspace_id=$2 for update', [caseId, user.workspace_id])).rows[0];
  if (!c) throw new HttpError(404, 'not_found', 'Case not found.');
  if (!TRANSITIONS[c.status]?.includes(to)) throw new HttpError(409, 'invalid_transition', `A case in status "${c.status}" cannot move to "${to}".`);
  if (['Resolved', 'Dismissed', 'Escalated', 'Clarification Requested'].includes(to) && (note ?? '').trim().length < 10) throw new HttpError(400, 'reason_required', 'A reason of at least 10 characters is required for this transition.');
  if (to === 'Assigned') {
    const a = assigneeId && (await db.query(`select id,name from users where id=$1 and workspace_id=$2 and active and role='regulator'`, [assigneeId, user.workspace_id])).rows[0];
    if (!a) throw new HttpError(400, 'assignee_required', 'Choose an active regulatory officer as assignee.');
    await db.query('update cases set assignee_id=$1 where id=$2', [a.id, caseId]); note = `Assigned to ${a.name}${note ? ': ' + note : ''}`;
  }
  const r = await db.query('update cases set status=$1,updated_at=now(),resolution_reason=case when $1 in($4,$5) then $2 when $1=$6 then null else resolution_reason end where id=$3 and status=$7', [to, note ?? null, caseId, 'Resolved', 'Dismissed', 'Open', c.status]);
  if (!r.rowCount) throw new HttpError(409, 'concurrent_update', 'The case was updated by someone else. Reload and retry.');
  await caseEvent(db, user.workspace_id, caseId, user, 'status_change', c.status, to, note ?? null);
  await audit(db, user, 'case.transition', 'case', caseId, null, { from: c.status, to });
}
export { FIELDS };
