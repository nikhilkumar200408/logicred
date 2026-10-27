import { createContext, useContext, useState, type ReactNode } from 'react';
import { ApiError } from './api';
export type Me = { user: { id: string; name: string; email: string; role: string; role_label: string; institution_id: string | null; state: string | null }; workspace: { kind: string }; permissions: string[] };
export const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx)!;
export const useCan = () => { const m = useMe(); return (p: string) => m.permissions.includes(p); };
export type Go = (page: string, params?: Record<string, string>) => void;
export const GoCtx = createContext<Go>(() => {});
export const useGo = () => useContext(GoCtx);
export const Params = createContext<Record<string, string>>({});

const CHIP: Record<string, string> = { High: 'red', Medium: 'amb', Low: 'blu', Open: 'amb', Assigned: 'blu', 'Under Review': 'blu', 'Clarification Requested': 'amb', Escalated: 'red', Resolved: 'grn', Dismissed: 'gry', accepted: 'grn', warning: 'amb', rejected: 'red', completed: 'grn', partial: 'amb', Active: 'grn', Withdrawn: 'gry', Transferred: 'blu', Cancelled: 'gry', published: 'grn', draft: 'gry', tested: 'blu', approved: 'blu', retired: 'gry', pending: 'amb', applied: 'grn', answered: 'grn', revoked: 'red', expired: 'gry', 'Exceeds approved intake': 'red', 'Within approved intake': 'grn' };
export const Chip = ({ t }: { t: string }) => <span className={'chip ' + (CHIP[t] ?? 'gry')}>{t}</span>;
export const Page = ({ title, desc, actions, children }: { title: string; desc?: string; actions?: ReactNode; children: ReactNode }) => (
  <div><div className="head"><div><h1>{title}</h1>{desc && <p className="mut">{desc}</p>}</div><div className="row">{actions}</div></div>{children}</div>);
export const Card = ({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) => <section className="card">{(title || actions) && <div className="chead"><h2>{title}</h2><div className="row">{actions}</div></div>}{children}</section>;
export const Notice = ({ kind = 'info', children }: { kind?: 'info' | 'ok' | 'err' | 'warn'; children: ReactNode }) => <div className={'notice ' + kind} role={kind === 'err' ? 'alert' : 'status'}>{children}</div>;
export const Loading = () => <div className="mut pad" aria-busy="true">Loading…</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export function ErrorBox({ e, retry }: { e: ApiError | Error; retry?: () => void }) {
  const a = e as ApiError, kind = a.status === 403 ? 'Permission denied' : a.status === 503 || a.status === 0 ? 'Service unavailable' : a.status >= 500 ? 'Server error' : 'Request problem';
  return <Notice kind="err"><b>{kind}.</b> {e.message}{a.details?.length ? <ul>{a.details.map((d: any, i: number) => <li key={i}>{d.field ? d.field + ': ' : ''}{d.message}</li>)}</ul> : null} {retry && <button className="btn sm" onClick={retry}>Retry</button>}</Notice>;
}
export function Async({ s, children }: { s: { data: any; error: any; loading: boolean; reload: () => void }; children: (d: any) => ReactNode }) {
  if (s.error) return <ErrorBox e={s.error} retry={s.reload} />; if (!s.data) return <Loading />; return <>{children(s.data)}</>;
}
export type Col<T = any> = { h: string; r: (row: T) => ReactNode; w?: string };
export function Table<T = any>({ cols, rows, onRow, empty = 'No records match these filters.' }: { cols: Col<T>[]; rows: T[]; onRow?: (r: T) => void; empty?: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return <div className="tw"><table><thead><tr>{cols.map(c => <th key={c.h}>{c.h}</th>)}</tr></thead><tbody>{rows.map((r: any, i) => <tr key={r.id ?? i} className={onRow ? 'cl' : ''} onClick={() => onRow?.(r)} tabIndex={onRow ? 0 : undefined} onKeyDown={e => e.key === 'Enter' && onRow?.(r)}>{cols.map(c => <td key={c.h}>{c.r(r)}</td>)}</tr>)}</tbody></table></div>;
}
export const Pager = ({ p, total, pageSize, set }: { p: number; total: number; pageSize: number; set: (n: number) => void }) => {
  const last = Math.max(1, Math.ceil(total / pageSize)); return <div className="row pager"><span className="mut">{total} record(s) · page {p} of {last}</span><button className="btn sm sec" disabled={p <= 1} onClick={() => set(p - 1)}>Previous</button><button className="btn sm sec" disabled={p >= last} onClick={() => set(p + 1)}>Next</button></div>;
};
export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => <label className="field"><span>{label}</span>{children}{hint && <small className="mut">{hint}</small>}</label>;
export const Kpi = ({ label, value, sub, onClick }: { label: string; value: ReactNode; sub?: string; onClick?: () => void }) => <button className="kpi" onClick={onClick} disabled={!onClick}><small>{label}</small><b>{value}</b>{sub && <small>{sub}</small>}</button>;
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}><div className="mbox" onClick={e => e.stopPropagation()}><div className="chead"><h2>{title}</h2><button className="btn sm sec" onClick={onClose}>Close</button></div>{children}</div></div>;
}
/** Runs an async action with busy/error/success state. */
export function useAction() {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<ApiError | null>(null), [okMsg, setOk] = useState('');
  const run = async <T,>(f: () => Promise<T>, msg = 'Saved.') => { setBusy(true); setErr(null); setOk(''); try { const r = await f(); setOk(msg); return r; } catch (e: any) { setErr(e); return undefined; } finally { setBusy(false); } };
  return { busy, err, okMsg, run, ui: <>{err && <ErrorBox e={err} />}{okMsg && <Notice kind="ok">{okMsg}</Notice>}</> };
}
