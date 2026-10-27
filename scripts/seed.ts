import './_env.js';
import { tx, closeDb } from '../server/db.js';
import { ensureEvalWorkspace } from '../server/seed.js';
const id = await tx(d => ensureEvalWorkspace(d));
console.log('Evaluation workspace ready (synthetic data only):', id);
await closeDb();
