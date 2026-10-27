import { useCallback, useEffect, useState } from 'react';
export class ApiError extends Error { constructor(public status: number, public code: string, message: string, public details?: any) { super(message); } }
export async function api<T = any>(path: string, o: { method?: string; body?: unknown; query?: Record<string, any> } = {}): Promise<T> {
  const qs = o.query ? '?' + new URLSearchParams(Object.entries(o.query).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)])).toString() : '';
  let r: Response;
  try { r = await fetch('/api' + path + (qs === '?' ? '' : qs), { method: o.method ?? 'GET', credentials: 'same-origin', headers: o.body ? { 'Content-Type': 'application/json' } : undefined, body: o.body ? JSON.stringify(o.body) : undefined }); }
  catch { throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection and try again.'); }
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { /* non-JSON */ }
  if (!r.ok) throw new ApiError(r.status, j?.error?.code ?? 'error', j?.error?.message ?? `Request failed (${r.status})`, j?.error?.details);
  return j as T;
}
export function useApi<T = any>(path: string | null, query?: Record<string, any>) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState<ApiError | null>(null), [loading, setLoading] = useState(!!path);
  const key = path + JSON.stringify(query ?? {});
  const load = useCallback(() => { if (!path) return; setLoading(true); api<T>(path, { query }).then(d => { setData(d); setError(null); }).catch(e => setError(e)).finally(() => setLoading(false)); }, [key]); // eslint-disable-line
  useEffect(load, [load]);
  return { data, error, loading, reload: load };
}
export const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
export function download(name: string, rows: any[][]) {
  const q = (v: any) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
