import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { MeCtx, GoCtx, Params, Notice, ErrorBox, Field, useAction, type Me } from './ui';
import { Overview, Institutions, Programmes, Upload, Imports } from './pages/a';
import { Students, History, Integrity, Conflicts, Cases, Versions, Impact } from './pages/b';
import { Policy, Simulator, Tests, Quality, Reports, Verification, Corrections, Users, Audit, Integrations } from './pages/c';

const any = (...p: string[]) => (m: Me) => p.some(x => m.permissions.includes(x));
const READ = any('read:all', 'read:inst', 'read:state');
const NAV: [string, string, (m: Me) => boolean, any, string][] = [
  ['overview', 'Overview', any('case:view'), Overview, 'Monitor'], ['integrity', 'Admission Integrity', READ, Integrity, 'Monitor'], ['conflicts', 'Conflict Explorer', any('case:view'), Conflicts, 'Monitor'], ['cases', 'Case Management', any('case:view'), Cases, 'Monitor'], ['quality', 'Data Quality', any('report'), Quality, 'Monitor'],
  ['institutions', 'Institution Registry', READ, Institutions, 'Registry'], ['programmes', 'Programmes and Approvals', READ, Programmes, 'Registry'], ['students', 'Student Records', READ, Students, 'Registry'], ['history', 'Enrolment History', READ, History, 'Registry'], ['versions', 'Record Version History', any('case:view'), Versions, 'Registry'], ['impact', 'Change Impact', any('case:view'), Impact, 'Registry'],
  ['upload', 'Bulk Upload Studio', any('import'), Upload, 'Data intake'], ['imports', 'Import History', any('import'), Imports, 'Data intake'], ['corrections', 'Correction Requests', any('correction:create', 'correction:decide'), Corrections, 'Data intake'],
  ['policy', 'Policy Management', any('rule:read'), Policy, 'Policy and testing'], ['simulator', 'Rule Impact Simulator', any('simulate'), Simulator, 'Policy and testing'], ['tests', 'Crash-Test Lab', any('tests:run'), Tests, 'Policy and testing'],
  ['verification', 'Verification Requests', any('verification:create', 'verification:manage'), Verification, 'Governance'], ['reports', 'Reports and Exports', any('report', 'export:db'), Reports, 'Governance'], ['users', 'User and Access', any('user:read'), Users, 'Governance'], ['audit', 'Audit Trail', any('audit:read'), Audit, 'Governance'], ['integrations', 'Integration Health', any('integration:read'), Integrations, 'Governance'],
];
const parse = () => { const h = location.hash.replace(/^#\/?/, ''); const [p, q] = h.split('?'); return { page: p || '', params: Object.fromEntries(new URLSearchParams(q ?? '')) as Record<string, string> }; };

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined), [route, setRoute] = useState(parse());
  useEffect(() => { const f = () => setRoute(parse()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const refresh = () => api<Me>('/me').then(setMe).catch(() => setMe(null));
  useEffect(() => { refresh(); }, []);
  const go = (page: string, params: Record<string, string> = {}) => { const q = new URLSearchParams(params).toString(); location.hash = '/' + page + (q ? '?' + q : ''); };
  if (me === undefined) return <div className="pad">Loading…</div>;
  if (!me) return route.page === 'login' ? <Login done={() => refresh().then(() => go('overview'))} /> : <Landing done={() => refresh().then(() => go(''))} />;
  const items = NAV.filter(n => n[2](me)), cur = items.find(n => n[0] === route.page) ?? items[0], Cmp = cur?.[3];
  const eval_ = me.workspace.kind === 'evaluation';
  return <MeCtx.Provider value={me}><GoCtx.Provider value={go}><Params.Provider value={route.params}>
    <div className="app"><nav className="side" aria-label="Main"><div className="brand">LogicRed<small>Academic record reconciliation</small></div>
      {[...new Set(items.map(n => n[4]))].map(g => <div key={g}><div className="grp">{g}</div>{items.filter(n => n[4] === g).map(n => <button key={n[0]} className={'nav ' + (cur?.[0] === n[0] ? 'on' : '')} onClick={() => go(n[0])}>{n[1]}</button>)}</div>)}</nav>
      <div className="main"><div className="top"><span className="mut">{me.user.name} · {me.user.role_label}{me.user.state ? ' · ' + me.user.state : ''}</span>
        <button className="btn sm sec" onClick={async () => { await api('/auth/logout', { method: 'POST' }); setMe(null); location.hash = ''; }}>Sign out</button></div>
        {eval_ && <div className="banner"><b>Evaluation Workspace.</b> All records are synthetic. Changes persist in the database; a regulatory officer can reset the workspace from Overview.</div>}
        <div className="pg">{Cmp ? <Cmp key={cur[0] + JSON.stringify(route.params)} /> : <Notice kind="warn">Your role has no screens available.</Notice>}</div></div></div>
  </Params.Provider></GoCtx.Provider></MeCtx.Provider>;
}

const ROLES: [string, string, string][] = [['regulator', 'AICTE Regulatory Officer', 'All institutions, cases, policy, simulation, testing'], ['inst_admin', 'Institution Administrator', 'One institution: import, respond to cases, approve corrections'], ['inst_staff', 'Admission / Examination Staff', 'One institution: import, respond, request corrections'], ['state_officer', 'Authorized State Officer', 'Read-only, state jurisdiction, masked identifiers'], ['verifier', 'Authorized Verification User', 'Purpose-limited verification requests only']];
function Landing({ done }: { done: () => void }) {
  const [role, setRole] = useState('regulator'), a = useAction();
  const features = [
    ['01', 'Intake reconciliation', 'Compare approved intake with reported enrolments and surface exceptions with traceable calculations.'],
    ['02', 'Conflict investigation', 'Review possible concurrent enrolment, identity mismatch and stale-status signals without treating them as proof.'],
    ['03', 'Rules you can test', 'Version policy rules, simulate their impact and run a crash-test suite before publication.'],
    ['04', 'Evidence-backed cases', 'Assign, respond to and resolve discrepancies with a clear history of decisions and record changes.'],
    ['05', 'Bulk data intake', 'Import CSV or Excel files, map columns, review row-level errors and retain import history.'],
    ['06', 'Governance & audit', 'Use scoped reports, purpose-limited verification and a searchable audit trail.'],
  ];
  return <div className="land">
    <header className="site-head"><a className="brandmark" href="#/" aria-label="LogicRed home"><span className="brand-icon">LR</span><span>LogicRed<small>ACADEMIC RECORD INTELLIGENCE</small></span></a><span className="head-tag">SIH 2026 · Working software prototype</span></header>
    <section className="hero hero-modern">
      <div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> RECORD RECONCILIATION · POLICY · GOVERNANCE</div>
        <h1>Make academic record discrepancies <em>traceable.</em></h1>
        <p className="hero-lead">A reconciliation and regulatory monitoring workspace for AICTE-approved institutions — designed to turn data mismatches into reviewable, evidence-backed cases.</p>
        <div className="hero-actions"><a href="#workspace" className="btn">Open evaluation workspace <span aria-hidden="true">↗</span></a><a href="#capabilities" className="btn sec">Explore capabilities</a></div>
        <div className="hero-note"><span className="note-mark">i</span> Evaluation mode uses fictional, synthetic records. Findings support human review; they do not establish wrongdoing.</div>
      </div>
      <div className="hero-visual" aria-label="Illustration of academic record reconciliation workflow">
        <div className="visual-top"><span>RECONCILIATION ENGINE</span><span className="status-pill">● READY TO REVIEW</span></div>
        <div className="visual-flow"><div className="flow-source"><span className="flow-symbol">▤</span><b>Approved intake</b><small>Institution records</small></div><div className="flow-connector"><span>→</span><small>compare</small></div><div className="flow-source active-source"><span className="flow-symbol">⌁</span><b>Reported enrolment</b><small>Uploaded records</small></div></div>
        <div className="visual-rule"><div className="rule-check">✓</div><div><b>Rule evaluation complete</b><small>Versioned rules · deterministic checks</small></div><span className="rule-count">Review</span></div>
        <div className="visual-bottom"><div><small>RESULT</small><b>Evidence-backed findings</b></div><div className="mini-bars"><i/><i/><i/><i/><i/><i/><i/></div></div>
        <div className="visual-caption">CONCEPTUAL WORKFLOW · NOT LIVE INSTITUTIONAL DATA</div>
      </div>
    </section>
    <section className="trust-strip" aria-label="Design principles"><div><b>Explainable</b><span>Rule + version + calculation</span></div><div><b>Review-first</b><span>Signals are not verdicts</span></div><div><b>Role-scoped</b><span>Access checked server-side</span></div><div><b>Audit-aware</b><span>Changes retain history</span></div></section>
    <section id="capabilities" className="cap-section"><div className="section-kicker">THE WORKSPACE</div><div className="section-heading"><div><h2>From data mismatch to accountable action.</h2><p>One workflow for intake, analysis, case handling and policy testing.</p></div><span className="section-index">01 / CAPABILITIES</span></div>
      <div className="feature-grid">{features.map(f => <article className="feature-card" key={f[0]}><span className="feature-num">{f[0]}</span><h3>{f[1]}</h3><p>{f[2]}</p><span className="feature-arrow" aria-hidden="true">↗</span></article>)}</div>
    </section>
    <section id="workspace" className="workspace-section"><div className="workspace-copy"><div className="section-kicker">INTERACTIVE EVALUATION</div><h2>Explore the workflow with synthetic records.</h2><p>Open a separate evaluation workspace to inspect seeded scenarios, test policy rules and follow discrepancy cases. No registration or external API key is required.</p><div className="workspace-points"><span>✓ Fictional records only</span><span>✓ Changes saved in the database</span><span>✓ No external service required for core rules</span></div></div>
      <div className="workspace-panel"><div className="panel-step">STEP 01 <span>Choose a role</span></div><Field label="Enter evaluation workspace as"><select value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select></Field><p className="role-description">{ROLES.find(r => r[0] === role)![2]}</p><button className="btn workspace-btn" disabled={a.busy} onClick={async () => { if (await a.run(() => api('/eval/start', { method: 'POST', body: { role } }), 'Opening workspace…')) done(); }}>{a.busy ? 'Opening workspace…' : 'Launch evaluation workspace'} <span aria-hidden="true">→</span></button><div className="panel-divider"><span>Already have an account?</span></div><a href="#/login" className="staff-link">Staff sign in <span aria-hidden="true">↗</span></a>{a.err && <ErrorBox e={a.err} />}</div>
    </section>
    <footer className="site-footer"><a className="brandmark footer-brand" href="#/"><span className="brand-icon">LR</span><span>LogicRed<small>ACADEMIC RECORD INTELLIGENCE</small></span></a><span>Prototype for evaluation · Not an official AICTE or APAAR service</span></footer>
  </div>;
}
function Login({ done }: { done: () => void }) {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), a = useAction();
  return <div className="land" style={{ maxWidth: 440 }}><div className="card"><h1>Sign in</h1><p className="mut">Accounts are created by a Platform Security Administrator. There is no public registration.</p>
    <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></Field><Field label="Password"><input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && document.getElementById('si')?.click()} /></Field>
    <div className="row"><button id="si" className="btn" disabled={a.busy || !email || !pw} onClick={async () => { if (await a.run(() => api('/auth/login', { method: 'POST', body: { email, password: pw } }), 'Signed in.')) done(); }}>Sign in</button><a href="#/">Back</a></div>{a.err && <ErrorBox e={a.err as ApiError} />}</div></div>;
}
