// Deterministic policy engine. Pure functions only: no I/O, no randomness, no external AI.
import { z } from 'zod';
import { createHash } from 'node:crypto';

export const CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'EWS', 'TFWS', 'Lateral Entry'] as const;
export const STATUSES = ['Active', 'Withdrawn', 'Transferred', 'Cancelled'] as const;
export const FIELDS = ['apaar_id', 'student_name', 'institution_code', 'programme', 'academic_year', 'category', 'status'] as const;
const statusList = z.array(z.enum(STATUSES)).min(1);

export const RULE_CONFIG = {
  required_fields: z.object({ fields: z.array(z.enum(FIELDS)).min(1) }).strict(),
  identifier_format: z.object({ length: z.number().int().min(6).max(20) }).strict(),
  intake_cap: z.object({ excluded_categories: z.array(z.enum(CATEGORIES)), counted_statuses: statusList, tolerance: z.number().int().min(0).max(1000) }).strict(),
  concurrent_enrolment: z.object({ statuses: statusList, grace_days: z.number().int().min(0).max(365) }).strict(),
  identity_match: z.object({ min_similarity: z.number().min(0).max(1) }).strict(),
  stale_status: z.object({ max_age_days: z.number().int().min(1).max(3650), statuses: statusList }).strict(),
} as const;
export type RuleType = keyof typeof RULE_CONFIG;
export const RULE_TYPES = Object.keys(RULE_CONFIG) as RuleType[];
export function parseRuleConfig(type: string, config: unknown) {
  const s = (RULE_CONFIG as any)[type] as z.ZodTypeAny | undefined;
  if (!s) throw new Error('Unknown rule type ' + type);
  return s.parse(config);
}

export type Rule = { key: string; version: number; type: RuleType | string; config: any };
export type Enr = { id: string; apaar: string; name: string; inst_id: string; inst_code: string; prog_id: string; prog: string; year: string; category: string; status: string; reported_at: string };
export type Appr = { prog_id: string; year: string; approved: number; reference: string };
export type Finding = {
  key: string; type: 'intake_excess' | 'missing_approval' | 'concurrent_enrolment' | 'identity_mismatch' | 'stale_status';
  rule_key: string; rule_version: number; severity: 'High' | 'Medium' | 'Low'; institution_ids: string[]; year: string;
  evidence: { records: any[]; total: number }; calculation: string; recommendation: string;
};

export const maskId = (a: string) => (a.length > 6 ? a.slice(0, 3) + '*'.repeat(a.length - 6) + a.slice(-3) : '*'.repeat(a.length));
export const normName = (n: string) => n.toLowerCase().replace(/\(synthetic\)/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
export function similarity(a: string, b: string) {
  const x = new Set(normName(a)), y = new Set(normName(b));
  if (!x.size && !y.size) return 1;
  let i = 0; x.forEach(t => y.has(t) && i++);
  return i / (x.size + y.size - i);
}
const rec = (e: Enr) => ({ id: e.id, apaar: maskId(e.apaar), name: e.name, institution: e.inst_code, programme: e.prog, year: e.year, category: e.category, status: e.status, reported_at: e.reported_at.slice(0, 10) });
const ev = (rs: Enr[], cap = 100) => ({ records: rs.slice(0, cap).map(rec), total: rs.length });
const days = (a: string | Date, b: string | Date) => Math.floor((+new Date(a) - +new Date(b)) / 86400000);

export function evaluate(enrs: Enr[], apprs: Appr[], rules: Rule[], asOf: Date): Finding[] {
  const out: Finding[] = [];
  const by = <T,>(xs: T[], k: (x: T) => string) => { const m = new Map<string, T[]>(); xs.forEach(x => { const kk = k(x); (m.get(kk) ?? m.set(kk, []).get(kk)!).push(x); }); return m; };
  for (const r of rules) {
    const c = r.config;
    if (r.type === 'intake_cap') {
      const ap = new Map(apprs.map(a => [a.prog_id + '|' + a.year, a]));
      for (const [k, g] of by(enrs, e => e.prog_id + '|' + e.year)) {
        const reg = g.filter(e => c.counted_statuses.includes(e.status) && !c.excluded_categories.includes(e.category));
        const sp = g.filter(e => c.counted_statuses.includes(e.status)).length - reg.length;
        const a = ap.get(k);
        if (!a) {
          if (reg.length) out.push({ key: 'missing_approval|' + k, type: 'missing_approval', rule_key: r.key, rule_version: r.version, severity: 'Medium', institution_ids: [g[0].inst_id], year: g[0].year,
            evidence: ev(reg), calculation: `${reg.length} counted enrolment(s) reported for ${g[0].prog} ${g[0].year}; no approval reference is recorded.`, recommendation: 'Record the applicable AICTE approval reference or confirm with the institution.' });
          continue;
        }
        if (reg.length > a.approved + c.tolerance) {
          const ex = reg.length - a.approved;
          out.push({ key: 'intake_excess|' + k, type: 'intake_excess', rule_key: r.key, rule_version: r.version, severity: ex >= 3 ? 'High' : 'Medium', institution_ids: [g[0].inst_id], year: g[0].year, evidence: ev(reg),
            calculation: `Regular enrolments ${reg.length} (statuses ${c.counted_statuses.join('/')}; excluding ${c.excluded_categories.join(', ') || 'none'}) minus approved intake ${a.approved} (ref ${a.reference}) = ${ex}; tolerance ${c.tolerance}. Excluded category enrolments counted separately: ${sp}.`,
            recommendation: 'Request the institution to confirm category classification and reporting; review against the approval reference.' });
        }
      }
    } else if (r.type === 'concurrent_enrolment') {
      for (const [k, g] of by(enrs.filter(e => c.statuses.includes(e.status)), e => e.apaar + '|' + e.year)) {
        const insts = [...new Set(g.map(e => e.inst_id))];
        if (insts.length < 2) continue;
        const ts = g.map(e => +new Date(e.reported_at)), gap = Math.round((Math.max(...ts) - Math.min(...ts)) / 86400000);
        const slow = c.grace_days > 0 && gap > c.grace_days;
        out.push({ key: 'concurrent|' + k, type: 'concurrent_enrolment', rule_key: r.key, rule_version: r.version, severity: slow ? 'Medium' : 'High', institution_ids: insts, year: g[0].year, evidence: ev(g),
          calculation: `Identifier ${maskId(g[0].apaar)} has ${g.length} enrolments in statuses ${c.statuses.join('/')} at ${insts.length} institutions in ${g[0].year}. Reporting gap ${gap} day(s), grace ${c.grace_days}.`,
          recommendation: slow ? 'Reports are far apart: one institution may not yet have recorded a transfer or withdrawal. Request a status update before any other step.' : 'Request clarification from both institutions with supporting evidence. This is a reason for review, not proof of wrongdoing.' });
      }
    } else if (r.type === 'identity_match') {
      for (const [, g] of by(enrs, e => e.apaar)) {
        const bad = g.some((a, i) => g.slice(i + 1).some(b => similarity(a.name, b.name) < c.min_similarity));
        if (g.length > 1 && bad) out.push({ key: 'identity|' + g[0].apaar, type: 'identity_mismatch', rule_key: r.key, rule_version: r.version, severity: 'Medium', institution_ids: [...new Set(g.map(e => e.inst_id))], year: g[0].year, evidence: ev(g),
          calculation: `Records sharing identifier ${maskId(g[0].apaar)} report names whose token similarity is below ${c.min_similarity}.`, recommendation: 'Ask institutions to verify the identifier and name against source documents; a typing error in the identifier is a common cause.' });
      }
    } else if (r.type === 'stale_status') {
      for (const e of enrs) if (c.statuses.includes(e.status) && days(asOf, e.reported_at) > c.max_age_days)
        out.push({ key: 'stale|' + e.id, type: 'stale_status', rule_key: r.key, rule_version: r.version, severity: 'Low', institution_ids: [e.inst_id], year: e.year, evidence: ev([e]),
          calculation: `Status ${e.status} last reported ${days(asOf, e.reported_at)} day(s) before ${asOf.toISOString().slice(0, 10)}; limit ${c.max_age_days} day(s).`, recommendation: 'Ask the institution to re-confirm or update the enrolment status.' });
    }
  }
  return out;
}

// ---- Row validation (bulk import). Required fields and identifier format come from published rules.
export type RowIn = Partial<Record<(typeof FIELDS)[number], string>>;
export type Refs = { insts: Map<string, { id: string }>; progs: Map<string, string>; existing: Set<string>; scopeInst?: string | null; hasApproval: (progId: string, year: string) => boolean };
export const normYear = (y: string) => { const m = /^(\d{4})\s*[-/–]\s*(\d{2}|\d{4})$/.exec(y.trim()); if (!m) return y.trim(); return `${m[1]}-${m[2].slice(-2)}`; };
export const rowKey = (apaar: string, inst: string, prog: string, year: string) => [apaar, inst, prog, year].join('|');

export function validateRow(raw: RowIn, rules: Rule[], refs: Refs, seen: Set<string>) {
  const g = (f: (typeof FIELDS)[number]) => (raw[f] ?? '').toString().replace(/\s+/g, ' ').trim();
  const n = { apaar_id: g('apaar_id').replace(/[\s-]/g, ''), student_name: g('student_name'), institution_code: g('institution_code').toUpperCase(), programme: g('programme'), academic_year: normYear(g('academic_year')),
    category: g('category'), status: g('status') };
  const errors: string[] = [], warnings: string[] = [];
  const canon = (v: string, list: readonly string[]) => list.find(x => x.toLowerCase() === v.toLowerCase());
  const reqRule = rules.find(r => r.type === 'required_fields'), idRule = rules.find(r => r.type === 'identifier_format');
  const required: string[] = reqRule?.config.fields ?? ['apaar_id', 'student_name', 'institution_code', 'programme', 'academic_year', 'category'];
  for (const f of required) if (!(n as any)[f]) errors.push(`Missing ${f}`);
  const L = idRule?.config.length ?? 12;
  if (n.apaar_id && !new RegExp(`^\\d{${L}}$`).test(n.apaar_id)) errors.push(`apaar_id must be exactly ${L} digits`);
  if (n.category) { const c = canon(n.category, CATEGORIES); c ? (n.category = c) : errors.push(`Invalid category "${n.category}"`); }
  if (!n.status) { n.status = 'Active'; warnings.push('Missing status, defaulted to Active'); } else { const s = canon(n.status, STATUSES); s ? (n.status = s) : errors.push(`Invalid status "${n.status}"`); }
  if (n.academic_year && !(/^\d{4}-\d{2}$/.test(n.academic_year) && (+n.academic_year.slice(0, 4) + 1) % 100 === +n.academic_year.slice(5))) errors.push(`Invalid academic_year "${n.academic_year}" (use e.g. 2026-27)`);
  let instId: string | undefined, progId: string | undefined;
  if (n.institution_code) {
    const i = refs.insts.get(n.institution_code);
    if (!i) errors.push(`Unknown institution_code ${n.institution_code}`);
    else if (refs.scopeInst && refs.scopeInst !== i.id) errors.push(`Not authorised to import for ${n.institution_code}`);
    else instId = i.id;
  }
  if (n.programme && instId) { progId = refs.progs.get(n.institution_code + '|' + n.programme); if (!progId) errors.push(`Unknown programme "${n.programme}" for ${n.institution_code}`); }
  if (!errors.length) {
    const k = rowKey(n.apaar_id, n.institution_code, n.programme, n.academic_year);
    if (refs.existing.has(k)) errors.push('Duplicate: record already exists for this identifier, institution, programme and year');
    else if (seen.has(k)) errors.push('Duplicate within this file');
    else { seen.add(k); if (!refs.hasApproval(progId!, n.academic_year)) warnings.push('No approval reference recorded for this programme and year'); }
  }
  return { norm: n, errors, warnings, instId, progId };
}

// Order- and whitespace-insensitive fingerprint used to block duplicate file imports.
export function importFingerprint(rows: RowIn[], _refs?: unknown) {
  const norm = rows.map(r => FIELDS.map(f => (r[f] ?? '').toString().replace(/\s+/g, ' ').trim().toLowerCase()).join('\u001f')).sort();
  return createHash('sha256').update(norm.join('\n')).digest('hex');
}

// ---- Simulation: compare candidate rule set to baseline on identical data (never writes).
export function simulate(enrs: Enr[], apprs: Appr[], baseline: Rule[], candidate: Rule[], asOf: Date) {
  const a = evaluate(enrs, apprs, baseline, asOf), b = evaluate(enrs, apprs, candidate, asOf);
  const ak = new Set(a.map(f => f.key)), bk = new Set(b.map(f => f.key));
  const added = b.filter(f => !ak.has(f.key)), removed = a.filter(f => !bk.has(f.key));
  const brief = (f: Finding) => ({ key: f.key, type: f.type, severity: f.severity, summary: f.calculation });
  return { baseline_count: a.length, candidate_count: b.length, unchanged: b.length - added.length, added: added.map(brief), removed: removed.map(brief), records_evaluated: enrs.length };
}

// ---- Crash-Test Lab: labelled synthetic scenarios, scored from real engine output.
export function runCrashTest(rules: Rule[], asOf = new Date('2026-10-01T00:00:00Z')) {
  const t0 = performance.now();
  const enrs: Enr[] = [], apprs: Appr[] = [], labels: { unit: string; scenario: string; expect: Finding['type'] | null; kind: 'finding' | 'import' }[] = [];
  const ts = (d: number) => new Date(asOf.getTime() - d * 86400000).toISOString();
  let n = 0;
  const tol: number = rules.find(r => r.type === 'intake_cap')?.config.tolerance ?? 0; // scenario sizes follow the live rule so results stay meaningful
  const mk = (u: string, tag: string, o: Partial<Enr> & { apaar: string; inst: string; status?: string; d?: number; name?: string; prog?: string }): Enr => ({ id: `${u}-${tag}`, apaar: o.apaar, name: o.name ?? 'Test Student', inst_id: o.inst, inst_code: o.inst, prog_id: o.prog ?? u + 'P', prog: o.prog ?? u + 'P', year: '2026-27', category: o.category ?? 'General', status: o.status ?? 'Active', reported_at: ts(o.d ?? 5) });
  const unit = () => `u${n++}`;
  const SC: [string, number, (u: string, i: number) => Finding['type'] | null][] = [
    ['true_overlap', 6, (u, i) => { const a = String(500000000000 + i * 17 + 1); enrs.push(mk(u, 'a', { apaar: a, inst: 'X' + u }), mk(u, 'b', { apaar: a, inst: 'Y' + u })); return 'concurrent_enrolment'; }],
    ['legitimate_transfer', 6, (u, i) => { const a = String(510000000000 + i * 17 + 1); enrs.push(mk(u, 'a', { apaar: a, inst: 'X' + u, status: 'Transferred' }), mk(u, 'b', { apaar: a, inst: 'Y' + u })); return null; }],
    ['similar_names_distinct_ids', 6, (u, i) => { enrs.push(mk(u, 'a', { apaar: String(520000000000 + i * 17 + 1), inst: 'X' + u, name: 'Rohan Sharma' }), mk(u, 'b', { apaar: String(520000000000 + i * 17 + 2), inst: 'Y' + u, name: 'Rohan Sharma' })); return null; }],
    ['identity_mismatch', 4, (u, i) => { const a = String(530000000000 + i * 17 + 1); enrs.push(mk(u, 'a', { apaar: a, inst: 'X' + u, name: 'Aarav Verma', status: 'Withdrawn' }), mk(u, 'b', { apaar: a, inst: 'Y' + u, name: 'Zoya Ansari' })); return 'identity_mismatch'; }],
    ['stale_status', 5, (u, i) => { enrs.push(mk(u, 'a', { apaar: String(540000000000 + i), inst: 'X' + u, d: 400 })); return 'stale_status'; }],
    ['fresh_status', 5, (u, i) => { enrs.push(mk(u, 'a', { apaar: String(550000000000 + i), inst: 'X' + u, d: 20 })); return null; }],
    ['intake_excess', 5, (u, i) => { apprs.push({ prog_id: u + 'P', year: '2026-27', approved: 3, reference: 'SYN-' + u }); for (let k = 0; k < 3 + tol + 3; k++) enrs.push(mk(u, 'r' + k, { apaar: String(560000000000 + i * 20 + k), inst: 'X' + u })); return 'intake_excess'; }],
    ['intake_within_with_excluded_categories', 5, (u, i) => { apprs.push({ prog_id: u + 'P', year: '2026-27', approved: 3, reference: 'SYN-' + u }); for (let k = 0; k < 3; k++) enrs.push(mk(u, 'r' + k, { apaar: String(570000000000 + i * 20 + k), inst: 'X' + u })); for (let k = 3; k < 6; k++) enrs.push(mk(u, 'r' + k, { apaar: String(570000000000 + i * 20 + k), inst: 'X' + u, category: 'TFWS' })); return null; }],
    ['corrected_record_clears_finding', 4, (u, i) => { const a = String(580000000000 + i * 17 + 1); enrs.push(mk(u, 'a', { apaar: a, inst: 'X' + u }), mk(u, 'b', { apaar: a, inst: 'Y' + u, status: 'Cancelled' })); return null; }],
  ];
  for (const [name, count, f] of SC) for (let i = 0; i < count; i++) { const u = unit(); labels.push({ unit: u, scenario: name, expect: f(u, n), kind: 'finding' }); }
  for (const pid of new Set(enrs.map(e => e.prog_id))) if (!apprs.some(a => a.prog_id === pid)) apprs.push({ prog_id: pid, year: '2026-27', approved: 1000, reference: 'SYN-LAB-DEFAULT' }); // neutral approval so only labelled scenarios can trigger intake findings
  const found = evaluate(enrs, apprs, rules.filter(r => !['required_fields', 'identifier_format'].includes(r.type)), asOf);
  const tally: Record<string, { scenario: string; units: number; tp: number; fp: number; fn: number; tn: number }> = {};
  const T = (s: string) => (tally[s] ??= { scenario: s, units: 0, tp: 0, fp: 0, fn: 0, tn: 0 });
  for (const l of labels) {
    const hit = found.some(f => f.evidence.records.some(r => r.id.startsWith(l.unit + '-')) && (l.expect ? f.type === l.expect : true));
    const t = T(l.scenario); t.units++;
    if (l.expect && hit) t.tp++; else if (l.expect && !hit) t.fn++; else if (!l.expect && hit) t.fp++; else t.tn++;
  }
  // Import-path scenarios (validator outcomes with known expected result)
  const refs: Refs = { insts: new Map([['INST1', { id: 'i1' }]]), progs: new Map([['INST1|B.Tech CSE', 'p1']]), existing: new Set([rowKey('600000000001', 'INST1', 'B.Tech CSE', '2026-27')]), hasApproval: () => true };
  const base = { institution_code: 'INST1', programme: 'B.Tech CSE', academic_year: '2026-27', category: 'General', status: 'Active', student_name: 'Test' };
  const imp: [string, RowIn, boolean][] = [
    ['duplicate_import', { ...base, apaar_id: '600000000001' }, false], ['missing_identifier', { ...base, apaar_id: '' }, false], ['malformed_identifier', { ...base, apaar_id: '12AB' }, false], ['valid_row', { ...base, apaar_id: '600000000099' }, true],
  ];
  const seen = new Set<string>();
  for (const [s, row, shouldPass] of imp) { const r = validateRow(row, rules, refs, seen); const pass = !r.errors.length; const t = T(s); t.units++; if (!shouldPass && !pass) t.tp++; else if (!shouldPass && pass) t.fn++; else if (shouldPass && !pass) t.fp++; else t.tn++; }
  { const t = T('upload_retry'); const f1 = [{ ...base, apaar_id: '600000000050' }, { ...base, apaar_id: '600000000051' }], f2 = [{ ...base, apaar_id: ' 600000000051 ' }, { ...base, apaar_id: '600000000050' }], f3 = [{ ...base, apaar_id: '600000000052' }];
    t.units += 2; importFingerprint(f1, refs) === importFingerprint(f2, refs) ? t.tp++ : t.fn++; importFingerprint(f1, refs) !== importFingerprint(f3, refs) ? t.tn++ : t.fp++; }
  const rows = Object.values(tally);
  const sum = (k: 'tp' | 'fp' | 'fn' | 'tn') => rows.reduce((a, r) => a + r[k], 0), tp = sum('tp'), fp = sum('fp'), fn = sum('fn'), tn = sum('tn');
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  return {
    metrics: { total_units: tp + fp + fn + tn, tp, fp, fn, tn, precision: tp + fp ? r4(tp / (tp + fp)) : null, recall: tp + fn ? r4(tp / (tp + fn)) : null, false_positive_rate: fp + tn ? r4(fp / (fp + tn)) : null, records_evaluated: enrs.length },
    scenarios: rows, duration_ms: Math.round((performance.now() - t0) * 100) / 100,
  };
}
