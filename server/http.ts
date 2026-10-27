import { z } from 'zod';
import { ZodError } from 'zod';
import { getDb, type Db } from './db.js';
import { HttpError, COOKIE, readSession, loadUser, need, rateLimit, hashIp, type User } from './auth.js';

export type Ctx = { u: User; db: Db; q: Record<string, string>; body: any; params: Record<string, string>; ip: string };
export type Out = { status: number; json?: unknown; text?: string; contentType?: string; filename?: string; cookie?: string };
export type PubCtx = { db: Db; q: Record<string, string>; body: any; ip: string; params: Record<string, string> };
type Route = { method: string; re: RegExp; keys: string[]; perm: string; fn: (c: any) => Promise<Out | unknown> };
const routes: Route[] = [];
/** perm: 'public' (no session), 'auth' (any signed-in user) or a permission string checked server-side. */
export function R(method: string, path: string, perm: string, fn: (c: any) => Promise<Out | unknown>) {
  const keys: string[] = []; const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, perm, fn });
}
export const parse = <T extends z.ZodTypeAny>(s: T, v: unknown): z.infer<T> => {
  const r = s.safeParse(v ?? {}); if (!r.success) throw new HttpError(400, 'validation_error', 'Some fields are invalid.', r.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
  return r.data;
};
export const page = (q: Record<string, string>) => { const p = Math.max(1, +q.page || 1), s = Math.min(100, Math.max(1, +q.pageSize || 25)); return { page: p, pageSize: s, offset: (p - 1) * s }; };
const isOut = (x: any): x is Out => x && typeof x === 'object' && typeof x.status === 'number' && ('json' in x || 'text' in x);

export type Req = { method: string; path: string; query: Record<string, string>; body: any; headers: Record<string, string | undefined>; ip: string };
export async function handle(req: Req): Promise<Out> {
  try {
    const path = req.path.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
    let match: Route | undefined, params: Record<string, string> = {}, pathExists = false;
    for (const r of routes) { const m = r.re.exec(path); if (m) { pathExists = true; if (r.method === req.method) { match = r; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); break; } } }
    if (!match) throw new HttpError(pathExists ? 405 : 404, pathExists ? 'method_not_allowed' : 'not_found', pathExists ? 'Method not allowed.' : 'Endpoint not found.');
    const write = req.method !== 'GET';
    if (write) {
      const o = req.headers.origin, h = req.headers.host;
      if (o && h && new URL(o).host !== h) throw new HttpError(403, 'bad_origin', 'Cross-origin write requests are not allowed.');
    }
    let db: Db;
    try { db = await getDb(); } catch (e: any) { throw new HttpError(503, 'database_unavailable', 'The database is currently unavailable. Your changes were not saved. Please retry shortly.'); }
    const base = { db, q: req.query, body: req.body, ip: req.ip, params };
    let out: unknown;
    if (match.perm === 'public') out = await match.fn(base);
    else {
      const cookie = (req.headers.cookie ?? '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
      const uid = readSession(cookie); const u = uid ? await loadUser(db, uid) : null;
      if (!u) throw new HttpError(401, 'unauthenticated', 'Please sign in to continue.');
      if (match.perm !== 'auth') need(u, match.perm);
      if (write) await rateLimit(db, 'w:' + u.id, 120, 60);
      out = await match.fn({ ...base, u });
    }
    return isOut(out) ? out : { status: 200, json: out };
  } catch (e: any) {
    if (e instanceof HttpError) return { status: e.status, json: { error: { code: e.code, message: e.message, details: e.details } } };
    if (e instanceof ZodError) return { status: 400, json: { error: { code: 'validation_error', message: 'Invalid input.', details: e.issues } } };
    const code = e?.code as string | undefined;
    if (code && /^(08|53|57)/.test(code) || /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout/i.test(String(e?.message))) return { status: 503, json: { error: { code: 'database_unavailable', message: 'The database is currently unavailable. Your changes were not saved. Please retry shortly.' } } };
    if (code === '23505') return { status: 409, json: { error: { code: 'conflict', message: 'A record with these values already exists.' } } };
    console.error('unhandled', e?.message); // message only: never log connection strings or payloads
    return { status: 500, json: { error: { code: 'internal_error', message: 'Something went wrong on the server. Nothing was reported as saved.' } } };
  }
}
export const ipOf = (h: Record<string, string | undefined>) => hashIp((h['x-forwarded-for'] ?? h['x-real-ip'] ?? 'local').split(',')[0].trim());
