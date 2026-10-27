import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import readXlsxFile from 'read-excel-file';
import { api, useApi, fmt, download } from '../api';
import { Page, Card, Async, Table, Kpi, Chip, Notice, Field, useAction, useGo, useCan, useMe, Modal, Pager, ErrorBox, Empty } from '../ui';

export function Overview() {
  const s = useApi('/overview'), go = useGo(), can = useCan(), me = useMe(), a = useAction();
  return <Page title="Overview" desc="Every figure is calculated from the database. Select a figure to open the matching records."
    actions={me.workspace.kind === 'evaluation' && can('record:edit') && <button className="btn sec" disabled={a.busy} onClick={async () => { if (confirm('Reset the Evaluation Workspace to its original synthetic data? Only this workspace is affected.')) { await a.run(() => api('/eval/reset', { method: 'POST' }), 'Workspace reset.'); s.reload(); } }}>Reset Evaluation Workspace</button>}>
    {a.ui}<Async s={s}>{d => <>
      <div className="grid"><Kpi label="Enrolment records" value={d.enrolments.total} sub={`${d.enrolments.active} Active · ${d.enrolments.institutions} institution(s)`} onClick={() => go('students')} />
        <Kpi label="Open cases" value={d.cases.open} sub="Not resolved or dismissed" onClick={() => go('cases', { open: '1' })} /><Kpi label="High severity open" value={d.cases.high} onClick={() => go('cases', { open: '1', severity: 'High' })} />
        <Kpi label="Resolved cases" value={d.cases.resolved} onClick={() => go('cases', { status: 'Resolved' })} /><Kpi label="Intake utilisation" value={`${d.intake.regular} / ${d.intake.approved}`} sub="Regular admissions vs approved intake (special categories excluded)" onClick={() => go('integrity')} /></div>
      <div className="g2"><Card title="Approved intake vs recorded regular admissions">{d.intake.rows.length ? <div style={{ height: 320 }}><ResponsiveContainer><BarChart data={d.intake.rows}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} interval={0} angle={-30} textAnchor="end" height={70} /><YAxis fontSize={12} allowDecimals={false} /><Tooltip /><Legend />
        <Bar dataKey="approved" name="Approved" fill="#b7c7ee" onClick={(x: any) => go('integrity', { institution_id: x.institution_id })} cursor="pointer" /><Bar dataKey="regular" name="Recorded" fill="#1d4ed8" onClick={(x: any) => go('integrity', { institution_id: x.institution_id })} cursor="pointer" /></BarChart></ResponsiveContainer></div> : <Empty>No approval references recorded yet.</Empty>}</Card>
        <Card title="Open cases by type">{Object.keys(d.cases.by_type).length ? Object.entries(d.cases.by_type).map(([k, n]: any) => <div key={k} style={{ marginBottom: 10 }}><button className="btn sm sec" style={{ width: '100%', textAlign: 'left' }} onClick={() => go('cases', { open: '1', type: k })}>{k.replace(/_/g, ' ')} · <b>{n}</b></button></div>) : <Empty>No open cases.</Empty>}</Card></div>
      {d.imports.length > 0 && <Card title="Recent imports"><Table rows={d.imports} cols={[{ h: 'File', r: (r: any) => r.filename }, { h: 'Outcome', r: (r: any) => <Chip t={r.status} /> }, { h: 'Accepted', r: (r: any) => r.accepted }, { h: 'Rejected', r: (r: any) => r.rejected }, { h: 'When', r: (r: any) => fmt(r.created_at) }]} onRow={() => go('imports')} /></Card>}
    </>}</Async></Page>;
}

export function Institutions() {
  const s = useApi('/institutions'), can = useCan(), a = useAction(), [f, setF] = useState({ code: '', name: '', state: '' });
  return <Page title="Institution Registry" desc="Institutions in your scope. Evaluation Workspace institutions are fictional.">
    <Async s={s}>{d => <Card><Table rows={d} cols={[{ h: 'Code', r: (r: any) => r.code }, { h: 'Name', r: (r: any) => <>{r.name} {r.synthetic && <Chip t="Synthetic" />}</> }, { h: 'State', r: (r: any) => r.state }, { h: 'Programmes', r: (r: any) => r.programmes }, { h: 'Enrolments', r: (r: any) => r.enrolments }]} /></Card>}</Async>
    {can('institution:manage') && <Card title="Add institution"><div className="form">{(['code', 'name', 'state'] as const).map(k => <Field key={k} label={k[0].toUpperCase() + k.slice(1)} hint={k === 'code' ? 'Capital letters, digits, hyphens' : undefined}><input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></Field>)}</div>
      <button className="btn" disabled={a.busy} onClick={async () => { if (await a.run(() => api('/institutions', { method: 'POST', body: f }), 'Institution added.')) { setF({ code: '', name: '', state: '' }); s.reload(); } }}>Add institution</button>{a.ui}</Card>}</Page>;
}

export function Programmes() {
  const s = useApi('/programmes'), can = useCan(), a = useAction(), [f, setF] = useState<any>({ academic_year: '2026-27', approved_intake: 60, effective_from: '2026-04-01' });
  return <Page title="Programmes and Approval References" desc="Approved intake used by the intake rule. Changing an approval re-runs reconciliation.">
    <Async s={s}>{d => <><Card><Table rows={d} cols={[{ h: 'Institution', r: (r: any) => r.institution_code }, { h: 'Programme', r: (r: any) => r.programme }, { h: 'Year', r: (r: any) => r.academic_year ?? '—' }, { h: 'Approved intake', r: (r: any) => r.approved_intake ?? '—' }, { h: 'Reference', r: (r: any) => r.reference ?? 'No approval recorded' }, { h: 'Effective from', r: (r: any) => r.effective_from ?? '' }]} onRow={can('institution:manage') ? (r: any) => setF({ ...f, programme_id: r.programme_id }) : undefined} /></Card>
      {can('institution:manage') && <Card title="Record approval reference"><p className="mut">Select a programme row above, then enter the approval details.</p><div className="form">
        <Field label="Programme"><select value={f.programme_id ?? ''} onChange={e => setF({ ...f, programme_id: e.target.value })}><option value="">Choose…</option>{[...new Map(d.map((r: any) => [r.programme_id, r])).values()].map((r: any) => <option key={r.programme_id} value={r.programme_id}>{r.institution_code} · {r.programme}</option>)}</select></Field>
        <Field label="Academic year" hint="e.g. 2026-27"><input value={f.academic_year} onChange={e => setF({ ...f, academic_year: e.target.value })} /></Field><Field label="Approved intake"><input type="number" min={0} value={f.approved_intake} onChange={e => setF({ ...f, approved_intake: +e.target.value })} /></Field>
        <Field label="Approval reference"><input value={f.reference ?? ''} onChange={e => setF({ ...f, reference: e.target.value })} /></Field><Field label="Effective from"><input type="date" value={f.effective_from} onChange={e => setF({ ...f, effective_from: e.target.value })} /></Field></div>
        <button className="btn" disabled={a.busy || !f.programme_id} onClick={async () => { if (await a.run(() => api('/approvals', { method: 'PUT', body: f }), 'Approval saved and reconciliation re-run.')) s.reload(); }}>Save approval</button>{a.ui}</Card>}</>}</Async></Page>;
}

// ---------- Bulk Upload Studio ----------
const FIELDS = ['apaar_id', 'student_name', 'institution_code', 'programme', 'academic_year', 'category', 'status'];
const SYN: Record<string, string[]> = { apaar_id: ['apaarid', 'apaar', 'id'], student_name: ['studentname', 'name'], institution_code: ['institutioncode', 'institution', 'instcode', 'collegecode'], programme: ['programme', 'program', 'course'], academic_year: ['academicyear', 'year', 'session'], category: ['category', 'cat'], status: ['status', 'enrolmentstatus'] };
export function parseCSV(t: string) {
  const rows: string[][] = []; let r: string[] = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; rows.push(r); r = []; } else c += ch; }
  if (c || r.length) { r.push(c); rows.push(r); } return rows.filter(x => x.some(v => v.trim()));
}
export function Upload() {
  const go = useGo(), a = useAction(), [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null), [map, setMap] = useState<Record<string, number>>({}), [prev, setPrev] = useState<any>(null), [res, setRes] = useState<any>(null), [flt, setFlt] = useState('all'), [msg, setMsg] = useState('');
  const build = (f = file!, m = map) => f.rows.slice(1).map(r => Object.fromEntries(FIELDS.map(k => [k, m[k] >= 0 && m[k] != null ? String(r[m[k]] ?? '').trim() : ''])));
  async function pick(fl: File) {
    setPrev(null); setRes(null); setMsg('');
    if (fl.size > 3 * 1024 * 1024) return setMsg('File is larger than 3 MB. Split it into smaller files.');
    const ext = fl.name.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx'].includes(ext!)) return setMsg('Only .csv and .xlsx files are accepted.');
    try {
      const rows = ext === 'csv' ? parseCSV(await fl.text()) : (await readXlsxFile(fl)).map(r => r.map(v => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v))));
      if (rows.length < 2) return setMsg('The file has no data rows.'); if (rows.length > 2001) return setMsg('A single import may contain at most 2000 rows.');
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ''), m: Record<string, number> = {};
      FIELDS.forEach(k => (m[k] = rows[0].findIndex(h => SYN[k].includes(norm(h)))));
      setFile({ name: fl.name, rows }); setMap(m);
    } catch { setMsg('The file could not be read. Check that it is a valid CSV or Excel file.'); }
  }
  return <Page title="Bulk Upload Studio" desc="CSV or Excel (.xlsx), up to 2000 rows and 3 MB. Validation runs on the server. Nothing is saved until you confirm."
    actions={<button className="btn sec" onClick={() => download('logicred-template.csv', [FIELDS, ['700000000001', 'Sample Student (Synthetic)', 'SYN-1001', 'B.Tech ME', '2026-27', 'General', 'Active']])}>Download template</button>}>
    <Card title="1. Choose file"><input type="file" accept=".csv,.xlsx" aria-label="Choose CSV or Excel file" onChange={e => e.target.files?.[0] && pick(e.target.files[0])} />{msg && <Notice kind="err">{msg}</Notice>}{file && <p className="mut">{file.name}: {file.rows.length - 1} data row(s)</p>}</Card>
    {file && <Card title="2. Map columns"><div className="form">{FIELDS.map(k => <Field key={k} label={k + (k === 'status' ? ' (optional)' : '')}><select value={map[k] ?? -1} onChange={e => { setMap({ ...map, [k]: +e.target.value }); setPrev(null); }}><option value={-1}>Not in file</option>{file.rows[0].map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</select></Field>)}</div>
      <button className="btn" disabled={a.busy} onClick={async () => { const p = await a.run(() => api('/imports/preview', { method: 'POST', body: { filename: file.name, rows: build() } }), 'Preview ready.'); if (p) { setPrev(p); setRes(null); } }}>Validate and preview</button>{a.ui}</Card>}
    {prev && <Card title="3. Review"><div className="grid"><Kpi label="Rows" value={prev.summary.total} /><Kpi label="Accepted" value={prev.summary.accepted} sub={`${prev.summary.warnings} with warnings`} /><Kpi label="Rejected" value={prev.summary.rejected} /><Kpi label="Outcome" value={prev.summary.outcome === 'complete' ? 'Complete' : prev.summary.outcome === 'partial' ? 'Partial' : 'None accepted'} /></div>
      {prev.already_imported && <Notice kind="err">This file content has already been imported. Duplicate imports are blocked.</Notice>}
      {prev.summary.outcome === 'partial' && <Notice kind="warn">Partial acceptance: {prev.summary.rejected} row(s) will be skipped. Download the error report to correct and re-upload them.</Notice>}
      <div className="row"><select value={flt} onChange={e => setFlt(e.target.value)} aria-label="Row filter"><option value="all">All rows</option><option value="rejected">Rejected</option><option value="warning">Warnings</option><option value="accepted">Accepted</option></select>
        <button className="btn sm sec" onClick={() => download('logicred-error-report.csv', [['row', 'status', ...FIELDS, 'issues'], ...prev.rows.filter((r: any) => r.status !== 'accepted').map((r: any) => [r.row_no, r.status, ...FIELDS.map(k => r.data[k]), [...r.errors, ...r.warnings].join('; ')])])}>Download error report</button></div>
      <Table rows={prev.rows.filter((r: any) => flt === 'all' || r.status === flt).slice(0, 200)} cols={[{ h: 'Row', r: (r: any) => r.row_no }, { h: 'Status', r: (r: any) => <Chip t={r.status} /> }, { h: 'APAAR ID', r: (r: any) => r.data.apaar_id }, { h: 'Name', r: (r: any) => r.data.student_name }, { h: 'Institution', r: (r: any) => r.data.institution_code }, { h: 'Programme / year', r: (r: any) => `${r.data.programme} ${r.data.academic_year}` }, { h: 'Issues', r: (r: any) => [...r.errors, ...r.warnings].join('; ') }]} />
      <p className="mut">Showing up to 200 rows. The error report contains all.</p>
      <button className="btn" disabled={a.busy || prev.summary.accepted === 0 || prev.already_imported} onClick={async () => { const r = await a.run(() => api('/imports', { method: 'POST', body: { filename: file!.name, rows: build(), mapping: map } }), 'Import saved.'); if (r) { setRes(r); setPrev(null); setFile(null); } }}>{a.busy ? 'Importing…' : `Confirm import of ${prev.summary.accepted} row(s)`}</button></Card>}
    {res && <Notice kind={res.outcome === 'complete' ? 'ok' : 'warn'}><b>{res.outcome === 'complete' ? 'Import complete.' : 'Import partially accepted.'}</b> {res.accepted} accepted, {res.rejected} rejected, {res.warnings} with warnings. {res.reconciliation && `Reconciliation raised ${res.reconciliation.new_cases} new case(s) and cleared ${res.reconciliation.cleared}.`} <button className="btn sm" onClick={() => go('imports')}>View import history</button></Notice>}</Page>;
}

export function Imports() {
  const [p, setP] = useState(1), s = useApi('/imports', { page: p }), [open, setOpen] = useState<string | null>(null), d = useApi(open ? '/imports/' + open : null);
  return <Page title="Import History" desc="Every import job with its row-level results."><Async s={s}>{x => <Card><Table rows={x.items} cols={[{ h: 'File', r: (r: any) => r.filename }, { h: 'Institution', r: (r: any) => r.institution_code ?? 'All' }, { h: 'Outcome', r: (r: any) => <Chip t={r.status} /> }, { h: 'Rows', r: (r: any) => r.total }, { h: 'Accepted', r: (r: any) => r.accepted }, { h: 'Rejected', r: (r: any) => r.rejected }, { h: 'Warnings', r: (r: any) => r.warnings }, { h: 'By', r: (r: any) => r.created_by }, { h: 'When', r: (r: any) => fmt(r.created_at) }]} onRow={r => setOpen(r.id)} /><Pager p={p} total={x.total} pageSize={x.pageSize} set={setP} /></Card>}</Async>
    {open && <Modal title="Import rows" onClose={() => setOpen(null)}>{d.error ? <ErrorBox e={d.error} /> : !d.data ? <p>Loading…</p> : <>
      <button className="btn sm sec" onClick={() => download('import-rows.csv', [['row', 'status', ...FIELDS, 'issues'], ...d.data.rows.map((r: any) => [r.row_no, r.status, ...FIELDS.map(k => r.data[k]), r.issues.map((i: any) => i.message).join('; ')])])}>Download rows and errors</button>
      <Table rows={d.data.rows} cols={[{ h: 'Row', r: (r: any) => r.row_no }, { h: 'Status', r: (r: any) => <Chip t={r.status} /> }, { h: 'APAAR ID', r: (r: any) => r.data.apaar_id }, { h: 'Name', r: (r: any) => r.data.student_name }, { h: 'Issues', r: (r: any) => r.issues.map((i: any) => i.message).join('; ') }]} /></>}</Modal>}</Page>;
}
