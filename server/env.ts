import { z } from 'zod';
const schema = z.object({
  DATABASE_URL: z.string().min(10, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  BOOTSTRAP_TOKEN: z.string().min(16).optional(),
  ENABLE_EVALUATION_WORKSPACE: z.enum(['true', 'false']).default('true'),
  EVAL_ROW_CAP: z.coerce.number().int().positive().default(3000),
});
export type Env = z.infer<typeof schema>;
let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  const p = schema.safeParse({ ...process.env, DATABASE_URL: process.env.DATABASE_URL || (process.env.APAAR_TEST_DB ? 'pglite://memory' : undefined) });
  if (!p.success) throw new Error('Invalid environment: ' + p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  return (cached = p.data);
}
export const resetEnvCache = () => { cached = null; };
