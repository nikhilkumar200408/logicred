import { handle } from '../server/routes.js';
export type Res = { status: number; json: any; text?: string; cookie?: string };
export async function call(method: string, path: string, o: { body?: any; cookie?: string; query?: Record<string, string>; ip?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  const r = await handle({ method, path: '/api' + path, query: o.query ?? {}, body: o.body, headers: { cookie: o.cookie, ...o.headers }, ip: o.ip ?? 'test-ip' });
  return { status: r.status, json: r.json, text: r.text, cookie: r.cookie?.split(';')[0] };
}
export async function evalLogin(role: string, ip = 'test-ip') { const r = await call('POST', '/eval/start', { body: { role }, ip }); if (r.status !== 200) throw new Error('eval start failed ' + JSON.stringify(r.json)); return r.cookie!; }
