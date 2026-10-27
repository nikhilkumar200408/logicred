import '../scripts/_env.js';
import http from 'node:http';
import { handle, ipOf } from './routes.js';
http.createServer(async (rq, rs) => {
  const chunks: Buffer[] = []; for await (const c of rq) chunks.push(c as Buffer);
  const url = new URL(rq.url ?? '/', 'http://x'); const query: Record<string, string> = {}; url.searchParams.forEach((v, k) => (query[k] = v));
  const headers = Object.fromEntries(Object.entries(rq.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  let body: any; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined; } catch { body = undefined; }
  const o = await handle({ method: rq.method ?? 'GET', path: url.pathname, query, body, headers, ip: ipOf(headers) });
  const h: Record<string, string> = { 'Cache-Control': 'no-store', 'Content-Type': o.text !== undefined ? o.contentType ?? 'text/plain' : 'application/json' };
  if (o.cookie) h['Set-Cookie'] = o.cookie.replace('; Secure', ''); if (o.filename) h['Content-Disposition'] = `attachment; filename="${o.filename}"`;
  rs.writeHead(o.status, h); rs.end(o.text !== undefined ? o.text : JSON.stringify(o.json));
}).listen(8787, () => console.log('API on http://localhost:8787'));
