import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handle, ipOf } from '../server/routes.js';

export const config = { maxDuration: 30 };
export default async function (req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/', 'http://x'); const query: Record<string, string> = {}; url.searchParams.forEach((v, k) => (query[k] = v));
  const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const out = await handle({ method: req.method ?? 'GET', path: url.pathname, query, body: req.body, headers, ip: ipOf(headers) });
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  if (out.cookie) res.setHeader('Set-Cookie', out.cookie);
  if (out.filename) res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
  res.status(out.status);
  if (out.text !== undefined) { res.setHeader('Content-Type', out.contentType ?? 'text/plain'); res.send(out.text); } else res.json(out.json);
}
