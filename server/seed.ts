import type { Db } from './db.js';
import { reconcile, changeEnrolment, transitionCase, SYSTEM } from './services.js';
import { audit, type User, type Role } from './auth.js';

export const EVAL_SLUG = 'evaluation';
const RESET_ORDER = ['audit_events', 'integration_events', 'case_events', 'cases', 'findings', 'recon_runs', 'simulations', 'test_runs', 'verification_requests', 'correction_requests', 'record_versions', 'change_events', 'import_rows', 'import_jobs', 'enrolments', 'students', 'approvals', 'programmes', 'policy_rules', 'institutions'];

/** Idempotent and concurrency-safe: serialised by an advisory lock and guarded by workspaces.seeded_at. */
export async function ensureEvalWorkspace(db: Db): Promise<string> {
  await db.query('select pg_advisory_xact_lock(727002)');
  await db.query(`insert into workspaces(slug,name,kind) values($1,'Evaluation Workspace (synthetic data)','evaluation') on conflict(slug) do nothing`, [EVAL_SLUG]);
  const w = (await db.query('select id,seeded_at from workspaces where slug=$1', [EVAL_SLUG])).rows[0];
  if (!w.seeded_at) await seedWorkspace(db, w.id);
  return w.id;
}
export async function resetEvalWorkspace(db: Db, ws: string) {
  await db.query('select pg_advisory_xact_lock(727002)');
  const k = (await db.query('select kind from workspaces where id=$1', [ws])).rows[0];
  if (k?.kind !== 'evaluation') throw new Error('Refusing to reset a non-evaluation workspace');
  for (const t of RESET_ORDER) await db.query(`delete from ${t} where ${t === 'import_rows' ? 'workspace_id' : 'workspace_id'}=$1`, [ws]);
  await db.query('update workspaces set seeded_at=null where id=$1', [ws]);
  await seedWorkspace(db, ws);
}

async function seedWorkspace(db: Db, ws: string) {
  const ins = async (code: string, name: string, state: string) => (await db.query('insert into institutions(workspace_id,code,name,state,synthetic) values($1,$2,$3,$4,true) returning id', [ws, code, name, state])).rows[0].id as string;
  const I = [await ins('SYN-1001', 'Synthetic Institute of Technology, Alpha', 'Madhya Pradesh'), await ins('SYN-1002', 'Synthetic College of Engineering, Beta', 'Maharashtra'), await ins('SYN-1003', 'Synthetic Institute of Management and Technology, Gamma', 'Madhya Pradesh')];
  const P: Record<string, string> = {};
  for (const [i, id] of I.entries()) for (const p of ['B.Tech CSE', 'B.Tech ME']) {
    const pid = (await db.query('insert into programmes(workspace_id,institution_id,name) values($1,$2,$3) returning id', [ws, id, p])).rows[0].id; P[i + '|' + p] = pid;
    for (const y of ['2025-26', '2026-27']) await db.query('insert into approvals(workspace_id,programme_id,academic_year,approved_intake,reference,effective_from) values($1,$2,$3,10,$4,$5)', [ws, pid, y, `SYN-APR-${1001 + i}-${p.slice(-3)}-${y}`, y.slice(0, 4) + '-04-01']);
  }
  const U: [Role, string, number | null, string | null][] = [['regulator', 'Synthetic Regulatory Officer', null, null], ['inst_admin', 'Synthetic Institution Administrator', 0, null], ['inst_staff', 'Synthetic Admission Staff', 0, null], ['state_officer', 'Synthetic State Officer', null, 'Madhya Pradesh'], ['verifier', 'Synthetic Verification User', null, null]];
  for (const [role, name, ii, state] of U) await db.query(`insert into users(workspace_id,email,name,role,institution_id,state) values($1,$2,$3,$4,$5,$6) on conflict(workspace_id,email) do update set institution_id=excluded.institution_id,state=excluded.state,name=excluded.name,active=true`, [ws, `${role}@evaluation.invalid`, name, role, ii === null ? null : I[ii], state]);
  const reg = (await db.query(`select id,workspace_id,email,name,role,institution_id,state from users where workspace_id=$1 and role='regulator'`, [ws])).rows[0] as User;
  const rules: [string, string, string, any, string][] = [
    ['required-fields', 'Required fields', 'required_fields', { fields: ['apaar_id', 'student_name', 'institution_code', 'programme', 'academic_year', 'category'] }, 'Every import row must carry these fields.'],
    ['identifier-format', 'Identifier format', 'identifier_format', { length: 12 }, 'Academic identifiers are numeric with a fixed length (synthetic rule).'],
    ['intake-cap', 'Regular intake within approved intake', 'intake_cap', { excluded_categories: ['TFWS', 'Lateral Entry'], counted_statuses: ['Active'], tolerance: 0 }, 'Counts regular admissions against the approved intake reference.'],
    ['concurrent-enrolment', 'Single active enrolment per year', 'concurrent_enrolment', { statuses: ['Active'], grace_days: 30 }, 'Flags one identifier Active at several institutions in the same year.'],
    ['identity-match', 'Name consistency per identifier', 'identity_match', { min_similarity: 0.5 }, 'Flags records sharing an identifier but reporting dissimilar names.'],
    ['stale-status', 'Status freshness', 'stale_status', { max_age_days: 180, statuses: ['Active'] }, 'Active statuses must be re-confirmed within the limit.'],
  ];
  for (const [k, n, t, c, d] of rules) await db.query(`insert into policy_rules(workspace_id,key,version,name,description,type,config,status,effective_date,owner,created_by,approved_by,published_by,published_at) values($1,$2,1,$3,$4,$5,$6,'published','2025-04-01','AICTE Regulatory Cell (synthetic)',$7,$7,$7,now())`, [ws, k, n, d, t, JSON.stringify(c), reg.id]);
  await db.query(`insert into policy_rules(workspace_id,key,version,name,description,type,config,status,effective_date,owner,created_by) values($1,'intake-cap',2,'Regular intake with tolerance of 5','Draft for simulation: allows five admissions above approved intake before raising a finding.','intake_cap',$2,'draft','2026-11-01','AICTE Regulatory Cell (synthetic)',$3)`, [ws, JSON.stringify({ excluded_categories: ['TFWS', 'Lateral Entry'], counted_statuses: ['Active'], tolerance: 5 }), reg.id]);

  const rows: any[] = []; let c = 0;
  const F = ['Aarav', 'Diya', 'Kabir', 'Ishita', 'Rohan', 'Sneha', 'Vihaan', 'Tara', 'Arjun', 'Nisha', 'Kavya', 'Yash', 'Mira', 'Dev'], L = ['Sharma', 'Verma', 'Patel', 'Iyer', 'Khan', 'Nair', 'Joshi', 'Singh', 'Das', 'Menon'];
  const apaar = () => '9' + String(++c * 7919).padStart(11, '0');
  const add = (i: number, p: string, year: string, cat = 'General', status = 'Active', id?: string, name?: string, ago = 12) => { const a = id ?? apaar(); rows.push({ apaar: a, name: name ?? `${F[c % 14]} ${L[(c * 3) % 10]}`, inst: I[i], prog: P[i + '|' + p], year, cat, status, ago }); return a; };
  const mix = ['General', 'General', 'OBC', 'SC', 'EWS', 'ST', 'General', 'OBC', 'General'];
  for (const i of [0, 1, 2]) for (const p of ['B.Tech CSE', 'B.Tech ME']) for (const y of ['2025-26', '2026-27']) {
    const n = i === 0 && p === 'B.Tech CSE' && y === '2026-27' ? 13 : 8; // scenario 7: intake discrepancy
    for (let t = 0; t < n; t++) add(i, p, y, mix[t % 9]); add(i, p, y, 'TFWS'); add(i, p, y, 'Lateral Entry');
  }
  const ov = apaar(); add(0, 'B.Tech CSE', '2026-27', 'General', 'Active', ov, 'Rohan Iyer'); add(1, 'B.Tech CSE', '2026-27', 'General', 'Active', ov, 'Rohan Iyer'); // 5 overlap
  const tr = apaar(); add(0, 'B.Tech ME', '2026-27', 'General', 'Transferred', tr, 'Tara Menon'); add(2, 'B.Tech ME', '2026-27', 'General', 'Active', tr, 'Tara Menon'); // 6 transfer
  const idc = apaar(); add(0, 'B.Tech ME', '2025-26', 'OBC', 'Withdrawn', idc, 'Aarav Verma'); add(1, 'B.Tech ME', '2025-26', 'OBC', 'Active', idc, 'Zoya Ansari'); // 4 identity
  add(1, 'B.Tech CSE', '2025-26', 'General', 'Active', undefined, undefined, 400); add(2, 'B.Tech CSE', '2025-26', 'SC', 'Active', undefined, undefined, 420); // 8 stale
  const fx = apaar(); add(1, 'B.Tech ME', '2026-27', 'General', 'Active', fx, 'Neel Chauhan'); add(2, 'B.Tech ME', '2026-27', 'General', 'Active', fx, 'Neel Chauhan'); // 9 to be corrected
  await db.query(`insert into students(workspace_id,apaar_id,name) select distinct on (x.apaar) $1,x.apaar,x.name from jsonb_to_recordset($2::jsonb) as x(apaar text,name text) on conflict do nothing`, [ws, JSON.stringify(rows)]);
  await db.query(`insert into enrolments(workspace_id,student_id,institution_id,programme_id,academic_year,reported_name,category,status,reported_at,source)
    select $1,s.id,x.inst::uuid,x.prog::uuid,x.year,x.name,x.cat,x.status,now()-(x.ago||' days')::interval,'seed' from jsonb_to_recordset($2::jsonb) as x(apaar text,inst text,prog text,year text,name text,cat text,status text,ago int) join students s on s.workspace_id=$1 and s.apaar_id=x.apaar`, [ws, JSON.stringify(rows)]);
  // 2 & 3: a seeded import history with a missing-field row and a duplicate row
  const job = (await db.query(`insert into import_jobs(workspace_id,institution_id,filename,file_hash,status,total,accepted,rejected,warnings,created_by) values($1,$2,'synthetic_admissions_sample.csv','seed-sample-hash','partial',4,2,2,1,$3) returning id`, [ws, I[0], reg.id])).rows[0].id;
  const d = (a: string, n: string) => ({ apaar_id: a, student_name: n, institution_code: 'SYN-1001', programme: 'B.Tech CSE', academic_year: '2026-27', category: 'General', status: 'Active' });
  const ir: [number, string, any[], any][] = [[2, 'accepted', [], d('700000000001', 'Synthetic Student One')], [3, 'warning', [{ level: 'warning', message: 'Missing status, defaulted to Active' }], d('700000000002', 'Synthetic Student Two')], [4, 'rejected', [{ level: 'error', message: 'Missing apaar_id' }], d('', 'Synthetic Student Three')], [5, 'rejected', [{ level: 'error', message: 'Duplicate within this file' }], d('700000000001', 'Synthetic Student One')]];
  for (const [n, s, i, x] of ir) await db.query('insert into import_rows(job_id,workspace_id,row_no,status,issues,data) values($1,$2,$3,$4,$5,$6)', [job, ws, n, s, JSON.stringify(i), JSON.stringify(x)]);
  await audit(db, { id: reg.id, name: reg.name, role: 'regulator', workspace_id: ws }, 'workspace.seed', 'workspace', ws, null, { synthetic: true });
  // Reconcile, then exercise correction/revalidation and a resolved case so history exists.
  await reconcile(db, SYSTEM(ws), 'seed');
  const target = (await db.query(`select e.id from enrolments e join students s on s.id=e.student_id where e.workspace_id=$1 and s.apaar_id=$2 and e.institution_id=$3`, [ws, fx, I[2]])).rows[0].id;
  await changeEnrolment(db, { ...reg } as any, target, { status: 'Withdrawn' }, 'Institution confirmed the student withdrew before the session began (synthetic).', 'institution_confirmation');
  const stale = (await db.query(`select c.id from cases c join findings f on f.id=c.finding_id where c.workspace_id=$1 and f.type='stale_status' order by c.seq limit 1`, [ws])).rows[0];
  await transitionCase(db, reg, stale.id, 'Resolved', 'Institution re-confirmed the status in writing (synthetic note).');
  const idcase = (await db.query(`select c.id from cases c join findings f on f.id=c.finding_id where c.workspace_id=$1 and f.type='identity_mismatch' limit 1`, [ws])).rows[0];
  await transitionCase(db, reg, idcase.id, 'Clarification Requested', 'Please confirm the identifier and name against the source document.');
  const pe = (await db.query(`select e.id from enrolments e where e.workspace_id=$1 and e.institution_id=$2 and e.status='Active' and e.category='General' order by e.id limit 1`, [ws, I[0]])).rows[0].id;
  await db.query(`insert into correction_requests(workspace_id,enrolment_id,requested_by,requester_name,field,new_value,reason,status) select $1,$2,u.id,u.name,'category','OBC','Category entered incorrectly at admission (synthetic).','pending' from users u where u.workspace_id=$1 and u.role='inst_staff'`, [ws, pe]);
  await db.query(`insert into integration_events(workspace_id,integration,status,message) values($1,'seed','info','Evaluation Workspace seeded with synthetic records only.')`, [ws]);
  await db.query('update workspaces set seeded_at=now() where id=$1', [ws]);
}
