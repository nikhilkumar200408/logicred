// Creates the first Platform Security Administrator in the production workspace. Usage:
//   ADMIN_EMAIL=you@org.in ADMIN_NAME="Your Name" ADMIN_PASSWORD='long-password' npm run bootstrap
import './_env.js';
import { tx, closeDb } from '../server/db.js';
import { hashPassword, audit } from '../server/auth.js';
const { ADMIN_EMAIL: email, ADMIN_NAME: name, ADMIN_PASSWORD: pw } = process.env;
if (!email || !name || !pw || pw.length < 12) { console.error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (12+ characters).'); process.exit(1); }
const hash = await hashPassword(pw);
await tx(async d => {
  await d.query('select pg_advisory_xact_lock(727003)');
  await d.query(`insert into workspaces(slug,name,kind) values('primary','Production workspace','production') on conflict do nothing`);
  const ws = (await d.query(`select id from workspaces where slug='primary'`)).rows[0].id;
  if ((await d.query('select 1 from users where workspace_id=$1', [ws])).rowCount) throw new Error('The first administrator already exists.');
  const u = (await d.query(`insert into users(workspace_id,email,name,role,password_hash) values($1,$2,$3,'security_admin',$4) returning id`, [ws, email, name, hash])).rows[0];
  await audit(d, { id: u.id, name, role: 'security_admin', workspace_id: ws }, 'bootstrap.first_admin', 'user', u.id, null);
});
console.log('First administrator created. Sign in at /login with workspace "primary".');
await closeDb();
