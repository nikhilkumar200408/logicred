import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from './db.js';
import { env } from './env.js';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export type Role = 'regulator' | 'inst_admin' | 'inst_staff' | 'state_officer' | 'verifier' | 'security_admin';
export type User = { id: string; workspace_id: string; email: string; name: string; role: Role; institution_id: string | null; state: string | null; kind: 'production' | 'evaluation' };
export const ROLE_LABEL: Record<Role, string> = { regulator: 'AICTE Regulatory Officer', inst_admin: 'Institution Administrator', inst_staff: 'Institution Admission / Examination Staff', state_officer: 'Authorized State Officer', verifier: 'Authorized Verification User', security_admin: 'Platform Security Administrator' };
export const PERMS: Record<Role, string[]> = {
  regulator: ['read:all', 'import', 'record:edit', 'case:view', 'case:manage', 'rule:read', 'rule:draft', 'rule:publish', 'simulate', 'tests:run', 'reconcile', 'report', 'verification:manage', 'correction:decide', 'user:read', 'audit:read', 'integration:read', 'institution:manage'],
  inst_admin: ['read:inst', 'import', 'case:view', 'case:respond', 'rule:read', 'report', 'correction:create', 'correction:decide', 'audit:read'],
  inst_staff: ['read:inst', 'import', 'case:view', 'case:respond', 'rule:read', 'report', 'correction:create'],
  state_officer: ['read:state', 'case:view', 'rule:read', 'report', 'audit:read'],
  verifier: ['verification:create'],
  security_admin: ['user:manage', 'user:read', 'audit:read', 'export:db', 'integration:read'],
};
export const can = (u: User, p: string) => PERMS[u.role].includes(p);
export function need(u: User, p: string) { if (!can(u, p)) throw new HttpError(403, 'forbidden', `Your role (${ROLE_LABEL[u.role]}) is not permitted to perform this action.`); }

/** SQL fragment restricting institutions alias `a` to the caller's scope; pushes params. */
export function scopeSql(u: User, params: any[], a = 'i'): string {
  if (can(u, 'read:all')) return '';
  if (can(u, 'read:inst')) { params.push(u.institution_id); return ` and ${a}.id=$${params.length}`; }
  if (can(u, 'read:state')) { params.push(u.state); return ` and ${a}.state=$${params.length}`; }
  throw new HttpError(403, 'forbidden', 'Your role cannot read institutional records.');
}
export const scopedInstitutionId = (u: User) => (can(u, 'read:all') ? null : can(u, 'read:inst') ? u.institution_id : '__none__');

const scrypt = promisify(crypto.scrypt) as (p: string, s: Buffer, n: number) => Promise<Buffer>;
export async function hashPassword(pw: string) { const s = crypto.randomBytes(16); return `s1$${s.toString('hex')}$${(await scrypt(pw, s, 32)).toString('hex')}`; }
export async function verifyPassword(pw: string, h: string | null) {
  if (!h) return false; const [v, s, k] = h.split('$'); if (v !== 's1') return false;
  const d = await scrypt(pw, Buffer.from(s, 'hex'), 32); const e = Buffer.from(k, 'hex'); return d.length === e.length && crypto.timingSafeEqual(d, e);
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sig = (p: string) => crypto.createHmac('sha256', env().SESSION_SECRET).update(p).digest('base64url');
export const COOKIE = 'apaar_session';
export function makeSession(uid: string, hours = 8) { const p = b64(JSON.stringify({ uid, exp: Date.now() + hours * 3600_000 })); return `${p}.${sig(p)}`; }
export function readSession(tok?: string): string | null {
  if (!tok) return null; const [p, s] = tok.split('.'); if (!p || !s) return null;
  const e = Buffer.from(sig(p)), g = Buffer.from(s); if (e.length !== g.length || !crypto.timingSafeEqual(e, g)) return null;
  try { const j = JSON.parse(Buffer.from(p, 'base64url').toString()); return j.exp > Date.now() ? j.uid : null; } catch { return null; }
}
export const cookieHeader = (tok: string, maxAge = 8 * 3600) => `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : ''}`;

export async function loadUser(db: Db, uid: string): Promise<User | null> {
  const r = await db.query(`select u.id,u.workspace_id,u.email,u.name,u.role,u.institution_id,u.state,w.kind from users u join workspaces w on w.id=u.workspace_id where u.id=$1 and u.active`, [uid]);
  return r.rows[0] ?? null;
}
export async function rateLimit(db: Db, key: string, max: number, windowSec: number) {
  const r = await db.query(
    `insert into rate_limits(key,window_start,count) values($1,now(),1)
     on conflict(key) do update set count=case when rate_limits.window_start < now()-($2||' seconds')::interval then 1 else rate_limits.count+1 end,
       window_start=case when rate_limits.window_start < now()-($2||' seconds')::interval then now() else rate_limits.window_start end
     returning count`, [key, String(windowSec)]);
  if (r.rows[0].count > max) throw new HttpError(429, 'rate_limited', 'Too many requests. Please wait a moment and try again.');
}
export const hashIp = (ip: string) => crypto.createHmac('sha256', env().SESSION_SECRET).update(ip).digest('hex').slice(0, 24);
export async function audit(db: Db, u: Pick<User, 'id' | 'name' | 'role' | 'workspace_id'>, action: string, targetType: string | null, targetId: string | null, institutionId: string | null, detail?: unknown) {
  await db.query('insert into audit_events(workspace_id,actor_id,actor_name,actor_role,action,target_type,target_id,institution_id,detail) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [u.workspace_id, u.id, u.name, u.role, action, targetType, targetId, institutionId, detail ? JSON.stringify(detail) : null]);
}
