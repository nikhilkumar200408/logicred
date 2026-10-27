import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

export interface Db {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  exec(sql: string): Promise<void>;
}
let pool: pg.Pool | null = null;
let lite: any = null;

const fromClient = (c: pg.Pool | pg.PoolClient): Db => ({
  query: async (sql, params) => { const r = await c.query(sql, params); return { rows: r.rows, rowCount: r.rowCount ?? 0 }; },
  exec: async sql => { await c.query(sql); },
});
const fromLite = (c: any): Db => ({
  query: async (sql, params) => { const r = await c.query(sql, params); return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; },
  exec: async sql => { await c.exec(sql); },
});

async function base(): Promise<{ db: Db; tx: <T>(f: (d: Db) => Promise<T>) => Promise<T> }> {
  const e = env();
  if (process.env.APAAR_TEST_DB === 'pglite') {
    if (!lite) { const name = '@electric-sql/pglite'; const m: any = await import(/* @vite-ignore */ name); lite = new m.PGlite(); }
    return { db: fromLite(lite), tx: f => lite.transaction((t: any) => f(fromLite(t))) };
  }
  pool ??= new pg.Pool({ connectionString: e.DATABASE_URL, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 });
  const p = pool;
  return {
    db: fromClient(p),
    tx: async f => {
      const c = await p.connect();
      try { await c.query('begin'); const r = await f(fromClient(c)); await c.query('commit'); return r; }
      catch (err) { await c.query('rollback').catch(() => {}); throw err; }
      finally { c.release(); }
    },
  };
}

let ready: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const b = await base();
    const dir = path.join(process.cwd(), 'server', 'migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    await b.tx(async d => {
      await d.query('select pg_advisory_xact_lock(727001)');
      await d.exec('create table if not exists schema_migrations(name text primary key, applied_at timestamptz not null default now())');
      const done = new Set((await d.query('select name from schema_migrations')).rows.map((r: any) => r.name));
      for (const f of files) if (!done.has(f)) { await d.exec(fs.readFileSync(path.join(dir, f), 'utf8')); await d.query('insert into schema_migrations(name) values($1)', [f]); }
    });
  })().catch(e => { ready = null; throw e; });
  return ready;
}
export async function getDb(): Promise<Db> { await ensureSchema(); return (await base()).db; }
export async function tx<T>(f: (d: Db) => Promise<T>): Promise<T> { await ensureSchema(); return (await base()).tx(f); }
export async function closeDb() { await pool?.end(); pool = null; ready = null; }
