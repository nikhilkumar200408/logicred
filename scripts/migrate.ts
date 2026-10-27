import './_env.js';
import { ensureSchema, getDb, closeDb } from '../server/db.js';
await ensureSchema();
const db = await getDb();
const m = await db.query('select name,applied_at from schema_migrations order by name');
console.log('Applied migrations:\n' + m.rows.map((r: any) => '  ' + r.name).join('\n'));
await closeDb();
