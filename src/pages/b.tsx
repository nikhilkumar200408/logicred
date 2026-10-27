import { useContext, useState } from 'react';
import { api, useApi, fmt } from '../api';
import { Page, Card, Async, Table, Chip, Notice, Field, useAction, useGo, useCan, Params, Modal, Pager, Empty, Kpi } from '../ui';

const STATUSES = ['Active', 'Withdrawn', 'Transferred', 'Cancelled'], CATS = ['General', 'OBC', 'SC', 'ST', 'EWS', 'TFWS', 'Lateral Entry'];

export function RecordDetail({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const s = useApi('/enrolments/' + id), can = useCan(), go = useGo(), a = useAction(), [f, setF] = useState<any>({});
  return <Async s={s}>{d => { const e = d.enrolment; return <>
    <div className="grid"><Kpi label="Identifier" value={<span style={{ fontSize: 16 }}>{e.apaar_id}</span>} /><Kpi label="Reported name" value={<span style={{ fontSize: 16 }}>{e.name}</span>} /><Kpi label="Status" value={<Chip t={e.status} />} sub={`Category ${e.category} · version ${e.version}`} /></div>
    <h2>Enrolments for this identifier</h2><Table rows={d.history} cols={[{ h: 'Institution', r: (r: any) => r.institution_code }, { h: 'Programme', r: (r: any) => r.programme }, { h: 'Year', r: (r: any) => r.academic_year }, { h: 'Category', r: (r: any) => r.category }, { h: 'Status', r: (r: any) => <Chip t={r.status} /> }, { h: 'Reported', r: (r: any) => r.reported_at }]} />
    {d.cases.length > 0 && <><h2 style={{ marginTop: 14 }}>Linked cases</h2><div className="row">{d.cases.map((c: any) => <button key={c.id} className="btn sm sec" onClick={() => go('cases', { id: c.id })}>{c.ref} · {c.status}</button>)}</div></>}
    <h2 style={{ marginTop: 14 }}>Version history</h2><Table rows={d.versions} empty="No changes recorded: this is the original version." cols={[{ h: 'Version', r: (r: any) => r.version }, { h: 'Field', r: (r: any) => r.field }, { h: 'Previous', r: (r: any) => r.old_value }, { h: 'New', r: (r: any) => r.new_value }, { h: 'Reason', r: (r: any) => r.reason }, { h: 'By', r: (r: any) => r.actor_name }, { h: 'When', r: (r: any) => fmt(r.created_at) }]} />
    {can('record:edit') && <Card title="Correct this record"><p className="mut">The previous value is kept in history. Affected findings are revalidated automatically.</p><div className="form">
      <Field label="Status"><select value={f.status ?? e.status} onChange={x => setF({ ...f, status: x.target.value })}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select></Field><Field label="Category"><select value={f.category ?? e.category} onChange={x => setF({ ...f, category: x.target.value })}>{CATS.map(x => <option key={x}>{x}</option>)}</select></Field></div>
      <Field label="Reason (required, 10+ characters)"><input value={f.reason ?? ''} onChange={x => setF({ ...f, reason: x.target.value })} /></Field>
      <button className="btn" disabled={a.busy} onClick={async () => { const changes: any = {}; if ((f.status ?? e.status) !== e.status) changes.status = f.status; if ((f.category ?? e.category) !== e.category) changes.category = f.category;
        const r = await a.run(() => api('/enrolments/' + id, { method: 'PATCH', body: { changes, reason: f.reason ?? '', expected_version: e.version } }), 'Change saved and affected findings revalidated.'); if (r) { setF({}); s.reload(); onChanged?.(); } }}>Save correction</button>{a.ui}</Card>}</>; }}</Async>;
}

export function Students() {
  const init = useContext(Params), [q, setQ] = useState({ q: '', institution_id: init.institution_id ?? '', year: init.year ?? '', status: '', category: '' }), [p, setP] = useState(1), [sel, setSel] = useState<string | null>(null);
  const s = useApi('/enrolments', { ...q, page: p }), inst = useApi('/institutions');
  return <Page title="Student Records" desc="Persisted enrolment records within your scope. Select a row for history and corrections.">
    <Card><div className="row"><input placeholder="APAAR ID prefix or name" aria-label="Search" value={q.q} onChange={e => { setQ({ ...q, q: e.target.value }); setP(1); }} />
      <select aria-label="Institution" value={q.institution_id} onChange={e => { setQ({ ...q, institution_id: e.target.value }); setP(1); }}><option value="">All institutions</option>{inst.data?.map((i: any) => <option key={i.id} value={i.id}>{i.code}</option>)}</select>
      <select aria-label="Year" value={q.year} onChange={e => { setQ({ ...q, year: e.target.value }); setP(1); }}><option value="">All years</option><option>2025-26</option><option>2026-27</option></select>
      <select aria-label="Status" value={q.status} onChange={e => { setQ({ ...q, status: e.target.value }); setP(1); }}><option value="">All statuses</option>{STATUSES.map(x => <option key={x}>{x}</option>)}</select>
      <select aria-label="Category" value={q.category} onChange={e => { setQ({ ...q, category: e.target.value }); setP(1); }}><option value="">All categories</option>{CATS.map(x => <option key={x}>{x}</option>)}</select></div></Card>
    <Async s={s}>{d => <Card><Table rows={d.items} cols={[{ h: 'APAAR ID', r: (r: any) => r.apaar_id }, { h: 'Name', r: (r: any) => r.name }, { h: 'Institution', r: (r: any) => r.institution_code }, { h: 'Programme', r: (r: any) => r.programme }, { h: 'Year', r: (r: any) => r.academic_year }, { h: 'Category', r: (r: any) => r.category }, { h: 'Status', r: (r: any) => <Chip t={r.status} /> }, { h: 'Ver.', r: (r: any) => r.version }]} onRow={r => setSel(r.id)} /><Pager p={p} total={d.total} pageSize={d.pageSize} set={setP} /></Card>}</Async>
    {sel && <Modal title="Record detail" onClose={() => setSel(null)}><RecordDetail id={sel} onChanged={s.reload} /></Modal>}</Page>;
}
export function History() {
  const [q, setQ] = useState(''), [sel, setSel] = useState<string | null>(null), s = useApi(q.length >= 3 ? '/enrolments' : null, { q, pageSize: 20 });
  return <Page title="Enrolment History" desc="Search an identifier or name to see every enrolment, status change and linked case.">
    <Card><input style={{ width: 340 }} placeholder="APAAR ID or name (3+ characters)" aria-label="Search identifier" value={q} onChange={e => { setQ(e.target.value); setSel(null); }} />
      {q.length < 3 ? <p className="mut">Enter at least 3 characters.</p> : s.data && <Table rows={s.data.items} cols={[{ h: 'APAAR ID', r: (r: any) => r.apaar_id }, { h: 'Name', r: (r: any) => r.name }, { h: 'Institution', r: (r: any) => r.institution_code }, { h: 'Year', r: (r: any) => r.academic_year }, { h: 'Status', r: (r: any) => <Chip t={r.status} /> }]} onRow={r => setSel(r.id)} />}</Card>
    {sel && <Card title="Detail"><RecordDetail id={sel} /></Card>}</Page>;
}

export function Integrity() {
  const init = useContext(Params), s = useApi('/integrity'), go = useGo(), can = useCan(), a = useAction();
  return <Page title="Admission Integrity" desc="Approved intake against reported regular enrolments, calculated from persisted records using the published intake rule."
    actions={can('reconcile') && <button className="btn" disabled={a.busy} onClick={async () => { await a.run(() => api('/reconcile', { method: 'POST' }), 'Reconciliation complete.'); s.reload(); }}>Run reconciliation</button>}>{a.ui}
    <Async s={s}>{d => <>{d.rule ? <Notice>Rule applied: <b>{d.rule.key}</b> version {d.rule.version}. Special categories configured in the rule are counted separately.</Notice> : <Notice kind="warn">No published intake rule. Publish one under Policy Management.</Notice>}
      <Card><Table rows={d.rows.filter((r: any) => !init.institution_id || r.institution_id === init.institution_id)} cols={[{ h: 'Institution', r: (r: any) => r.institution_code }, { h: 'Programme', r: (r: any) => r.programme }, { h: 'Year', r: (r: any) => r.year }, { h: 'Approved', r: (r: any) => r.approved }, { h: 'Recorded regular', r: (r: any) => r.regular }, { h: 'Special', r: (r: any) => r.special }, { h: 'Variance', r: (r: any) => (r.variance > 0 ? '+' : '') + r.variance }, { h: 'Outcome', r: (r: any) => <Chip t={r.status} /> }, { h: 'Open cases', r: (r: any) => r.unresolved_cases }, { h: 'Last reported', r: (r: any) => r.last_reported }, { h: 'Reference', r: (r: any) => r.reference }]} onRow={(r: any) => go('cases', { q: `${r.institution_code} ${r.programme}`, open: '1' })} /></Card>
      <Card title="Reconciliation runs (history)"><Table rows={d.runs} cols={[{ h: 'When', r: (r: any) => fmt(r.started_at) }, { h: 'Trigger', r: (r: any) => r.trigger }, { h: 'Records', r: (r: any) => r.stats.records }, { h: 'Current findings', r: (r: any) => r.stats.current }, { h: 'New', r: (r: any) => r.stats.new }, { h: 'Cleared', r: (r: any) => r.stats.cleared }]} /></Card></>}</Async></Page>;
}

function Evidence({ f }: { f: any }) {
  return <><p><b>Rule:</b> {f.rule_key} v{f.rule_version} · <b>Reporting year:</b> {f.academic_year}</p><p><b>Calculation:</b> {f.calculation}</p><p><b>Recommended next step:</b> {f.recommendation}</p>
    <Table rows={f.evidence.records} cols={[{ h: 'APAAR ID', r: (r: any) => r.apaar }, { h: 'Name', r: (r: any) => r.name }, { h: 'Institution', r: (r: any) => r.institution }, { h: 'Programme', r: (r: any) => r.programme }, { h: 'Category', r: (r: any) => r.category }, { h: 'Status', r: (r: any) => <Chip t={r.status} /> }, { h: 'Reported', r: (r: any) => r.reported_at }]} />
    {f.evidence.total > f.evidence.records.length && <p className="mut">Showing {f.evidence.records.length} of {f.evidence.total} records.</p>}</>;
}
export function Conflicts() {
  const [p, setP] = useState(1), [st, setSt] = useState('current'), s = useApi('/findings', { type: 'concurrent_enrolment,identity_mismatch', status: st, page: p, pageSize: 10 }), go = useGo();
  return <Page title="Conflict Explorer" desc="Potential multi-institution conflicts. A match is a reason for review, not proof of wrongdoing. Legitimate transfers (Transferred, Withdrawn, Cancelled) are excluded by rule.">
    <div className="row" style={{ marginBottom: 10 }}><select aria-label="Finding status" value={st} onChange={e => { setSt(e.target.value); setP(1); }}><option value="current">Current</option><option value="cleared">Cleared by revalidation</option></select></div>
    <Async s={s}>{d => !d.items.length ? <Empty>No findings.</Empty> : <>{d.items.map((f: any) => <Card key={f.id} title={f.type === 'concurrent_enrolment' ? 'Concurrent enrolment' : 'Identity mismatch'} actions={<><Chip t={f.severity} /><Chip t={f.case_status} /><button className="btn sm" onClick={() => go('cases', { id: f.case_id })}>Open {f.case_ref}</button></>}><Evidence f={f} /></Card>)}<Pager p={p} total={d.total} pageSize={d.pageSize} set={setP} /></>}</Async></Page>;
}

export function Cases() {
  const init = useContext(Params), [q, setQ] = useState({ status: init.status ?? '', severity: init.severity ?? '', type: init.type ?? '', open: init.open ?? '', q: init.q ?? '' }), [p, setP] = useState(1), [sel, setSel] = useState<string | null>(init.id ?? null);
  const s = useApi('/cases', { ...q, page: p });
  return <Page title="Case Management" desc="Each finding maps to one case with full status history.">
    <Card><div className="row"><input placeholder="Search title" aria-label="Search cases" value={q.q} onChange={e => { setQ({ ...q, q: e.target.value }); setP(1); }} />
      <select aria-label="Status" value={q.status} onChange={e => { setQ({ ...q, status: e.target.value, open: '' }); setP(1); }}><option value="">All statuses</option>{['Open', 'Assigned', 'Clarification Requested', 'Under Review', 'Escalated', 'Resolved', 'Dismissed'].map(x => <option key={x}>{x}</option>)}</select>
      <select aria-label="Severity" value={q.severity} onChange={e => { setQ({ ...q, severity: e.target.value }); setP(1); }}><option value="">All severities</option>{['High', 'Medium', 'Low'].map(x => <option key={x}>{x}</option>)}</select>
      <select aria-label="Type" value={q.type} onChange={e => { setQ({ ...q, type: e.target.value }); setP(1); }}><option value="">All types</option>{['intake_excess', 'missing_approval', 'concurrent_enrolment', 'identity_mismatch', 'stale_status'].map(x => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</select>
      <label className="row"><input type="checkbox" checked={q.open === '1'} onChange={e => { setQ({ ...q, open: e.target.checked ? '1' : '' }); setP(1); }} /> Open only</label></div></Card>
    <Async s={s}>{d => <Card><Table rows={d.items} cols={[{ h: 'Case', r: (r: any) => r.ref }, { h: 'Title', r: (r: any) => r.title }, { h: 'Severity', r: (r: any) => <Chip t={r.severity} /> }, { h: 'Status', r: (r: any) => <Chip t={r.status} /> }, { h: 'Assignee', r: (r: any) => r.assignee ?? '—' }, { h: 'Updated', r: (r: any) => fmt(r.updated_at) }]} onRow={r => setSel(r.id)} /><Pager p={p} total={d.total} pageSize={d.pageSize} set={setP} /></Card>}</Async>
    {sel && <Modal title="Case" onClose={() => setSel(null)}><CaseDetail id={sel} onChanged={s.reload} /></Modal>}</Page>;
}
function CaseDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const s = useApi('/cases/' + id), can = useCan(), a = useAction(), [to, setTo] = useState('Under Review'), [note, setNote] = useState(''), [as, setAs] = useState(''), [rn, setRn] = useState('');
  const after = () => { s.reload(); onChanged(); setNote(''); setRn(''); };
  return <Async s={s}>{d => { const c = d.case; return <>
    <div className="row"><h2>{c.ref}</h2><Chip t={c.severity} /><Chip t={c.status} />{c.finding_status === 'cleared' && <Chip t="Finding cleared" />}<span className="mut">Assignee: {c.assignee ?? 'none'}</span></div><p>{c.title}</p>
    {c.resolution_reason && <Notice kind="ok"><b>Resolution reason:</b> {c.resolution_reason}</Notice>}
    <Evidence f={c} />
    {can('case:manage') && <Card title="Update case"><div className="form"><Field label="Move to"><select value={to} onChange={e => setTo(e.target.value)}>{['Open', 'Assigned', 'Clarification Requested', 'Under Review', 'Escalated', 'Resolved', 'Dismissed'].map(x => <option key={x}>{x}</option>)}</select></Field>
      {to === 'Assigned' && <Field label="Assignee"><select value={as} onChange={e => setAs(e.target.value)}><option value="">Choose…</option>{d.officers.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>}</div>
      <Field label="Reason or message (10+ characters required for resolve, dismiss, escalate, clarification)"><textarea value={note} onChange={e => setNote(e.target.value)} style={{ fontFamily: 'inherit' }} /></Field>
      <div className="row"><button className="btn" disabled={a.busy} onClick={async () => { if (await a.run(() => api(`/cases/${id}/transition`, { method: 'POST', body: { to, note: note || undefined, assignee_id: as || undefined } }), 'Case updated.')) after(); }}>Apply transition</button>
        <button className="btn sec" disabled={a.busy || note.length < 3} onClick={async () => { if (await a.run(() => api(`/cases/${id}/note`, { method: 'POST', body: { note } }), 'Internal note added.')) after(); }}>Add internal note</button></div>{a.ui}</Card>}
    {can('case:respond') && c.status === 'Clarification Requested' && <Card title="Respond to clarification request"><Field label="Your response (10+ characters)"><textarea value={rn} onChange={e => setRn(e.target.value)} style={{ fontFamily: 'inherit' }} /></Field><button className="btn" disabled={a.busy} onClick={async () => { if (await a.run(() => api(`/cases/${id}/respond`, { method: 'POST', body: { note: rn } }), 'Response sent.')) after(); }}>Send response</button>{a.ui}</Card>}
    <h2>History</h2><div className="tl">{d.events.map((e: any, i: number) => <div key={i}><b>{e.kind.replace(/_/g, ' ')}</b>{e.to_status && <> · {e.from_status ?? '—'} → {e.to_status}</>}<br />{e.note}<br /><small className="mut">{e.actor_name} · {fmt(e.created_at)}</small></div>)}</div></>; }}</Async>;
}

export function Versions() {
  const [p, setP] = useState(1), s = useApi('/versions', { page: p });
  return <Page title="Record Version History" desc="Field-level history. Previous values are never overwritten."><Async s={s}>{d => <Card><Table rows={d.items} cols={[{ h: 'When', r: (r: any) => fmt(r.created_at) }, { h: 'Institution', r: (r: any) => r.institution_code }, { h: 'Year', r: (r: any) => r.academic_year }, { h: 'Version', r: (r: any) => r.version }, { h: 'Field', r: (r: any) => r.field }, { h: 'Previous', r: (r: any) => r.old_value }, { h: 'New', r: (r: any) => r.new_value }, { h: 'Reason', r: (r: any) => r.reason }, { h: 'By', r: (r: any) => r.actor_name }, { h: 'Source', r: (r: any) => r.source }]} /><Pager p={p} total={(p - 1) * 25 + d.items.length + (d.items.length === 25 ? 1 : 0)} pageSize={25} set={setP} /></Card>}</Async></Page>;
}
export function Impact() {
  const s = useApi('/changes'), go = useGo();
  return <Page title="Change Impact" desc="For every record change: which cases were affected and what revalidation concluded. Prior outcomes stay in case history."><Async s={s}>{d => !d.items.length ? <Empty>No record changes yet.</Empty> : d.items.map((c: any) => <Card key={c.id} title={`${c.institution_code} · ${c.academic_year} · changed ${c.fields.join(', ')}`} actions={<span className="mut">{c.actor_name} · {fmt(c.created_at)}</span>}>
    <p><b>Reason:</b> {c.reason}</p>{c.impact.affected?.length ? <Table rows={c.impact.affected} cols={[{ h: 'Case', r: (r: any) => <button className="btn sm sec" onClick={() => go('cases', { id: r.case_id })}>{r.case_ref}</button> }, { h: 'Finding', r: (r: any) => r.finding_key.replace(/\|.*/, '') }, { h: 'Revalidation outcome', r: (r: any) => (r.outcome === 'cleared' ? 'Finding cleared' : r.outcome === 'still_present' ? 'Finding still present' : 'Changed') }]} /> : <p className="mut">No existing cases were affected.</p>}
    {c.impact.new_cases?.length > 0 && <p>New cases raised by this change: {c.impact.new_cases.length}</p>}</Card>)}</Async></Page>;
}
