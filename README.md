# LogicRed

Academic record reconciliation and regulatory monitoring for AICTE-approved institutions. React + Vite frontend, Vercel serverless API (`api/[...path].ts`), PostgreSQL (Neon recommended). All rules are deterministic; no AI service or paid API is used.

This was rebuilt from the supplied `logicred_redesigned.zip`, a client-only prototype that kept its state in `localStorage`. Its concepts (intake reconciliation, conflict detection, cases, synthetic seed) are retained, but all business logic now runs on the server against PostgreSQL.

## Architecture (free-tier compatible)

| Layer | Choice |
|---|---|
| Hosting | Vercel Hobby: static frontend plus one serverless function handling `/api/*` |
| Database | Neon PostgreSQL free plan (pooled connection string). Supabase also works because only `DATABASE_URL` is used |
| Auth | HMAC-signed, HttpOnly, SameSite=Lax session cookie; scrypt password hashes; server-side role checks on every route |
| Rate limits | Stored in PostgreSQL (works across serverless instances) |
| Migrations | `server/migrations/*.sql`, applied automatically under an advisory lock on first request, or with `npm run db:migrate` |

Check current limits before relying on any provider. Free plans change, and nothing here promises permanent hosting or uptime. Typical points to verify on the Neon and Vercel pricing/docs pages: compute that suspends when idle (the first request after idle is slower; the API returns a clear 503 if the database cannot be reached), storage and compute-hour quotas, the Vercel function timeout (set to 30 s) and the 4.5 MB request body limit. No keep-alive pings are used.

## Deploy on Vercel

1. Create a Neon project and copy the **pooled** connection string (host contains `-pooler`, `sslmode=require`).
2. Push this folder to a Git repository and import it in Vercel (framework preset: Vite; the included `vercel.json` sets build and function options).
3. Set environment variables (Project Settings, Environment Variables): `DATABASE_URL`, `SESSION_SECRET` (32+ random characters, for example `openssl rand -base64 48`), and optionally `BOOTSTRAP_TOKEN`, `ENABLE_EVALUATION_WORKSPACE`, `EVAL_ROW_CAP`. See `.env.example`.
4. Deploy. The first API request creates the schema. To run migrations explicitly: `DATABASE_URL=... npm run db:migrate`.
5. Open the Vercel URL and choose **Open Evaluation Workspace**. This creates and seeds the synthetic workspace once (idempotent, serialised with an advisory lock).

The public URL is the one Vercel assigns to your project (`https://<project>.vercel.app`). It has not been deployed from this environment.

## First administrator (production workspace)

Either set `BOOTSTRAP_TOKEN` and `POST /api/bootstrap` with `{token,email,name,password}` (works once, then returns 409; unset the token afterwards), or run locally:

```
ADMIN_EMAIL=you@org.in ADMIN_NAME="Your Name" ADMIN_PASSWORD='a-long-password' DATABASE_URL=... npm run bootstrap
```

Sign in at `#/login`. The administrator creates other users under User and Access. There is no public registration, and nobody can change their own role.

## Evaluation Workspace

A separate `evaluation` workspace holds fictional institutions, programmes, approvals, students, rules, cases and history, all marked synthetic. Public visitors can enter as a regulator, institution admin, institution staff, state officer or verification user, never as a security administrator. It is scoped by `workspace_id`, capped at `EVAL_ROW_CAP` enrolments, and rate limited. A regulator can reset it (rate limited, refuses non-evaluation workspaces). Seeded scenarios: valid record, missing field and duplicate rows in an import, identity mismatch, overlapping enrolment, legitimate transfer, intake excess, stale status, a corrected record that was revalidated, and a resolved case with history.

## Local development

```
npm install
cp .env.example .env        # fill DATABASE_URL and SESSION_SECRET
npm run dev:api             # API on :8787
npm run dev                 # Vite on :5173 (proxies /api)
npm test                    # runs against in-process Postgres (PGlite)
npm run build               # type-check + production build
```

## Backup, export, recovery

- Administrators can download per-table JSON from Reports and Exports (no password hashes).
- For a full backup use `pg_dump "$DATABASE_URL" > backup.sql` and keep it somewhere safe; restore with `psql`. Neon also offers point-in-time restore within its plan's retention window; check the current window for the free plan.
- Data is lost if the database is deleted or the provider suspends or removes it.

## Implemented

Persistent institutions, programmes, approval references, enrolments; CSV and Excel upload with column mapping, server validation, row-level errors, error report, duplicate-file blocking, partial acceptance and transactional commit; deterministic rules stored as validated configuration (draft, tested, approved, published, retired); intake reconciliation; concurrent-enrolment and identity-mismatch detection that excludes transfers, withdrawals and cancellations; stale-status detection; findings with rule, version, calculation, evidence and next step; cases with enforced transitions, assignment, clarification and institution response; versioned records with revalidation and Change Impact; rule simulation without touching production; Crash-Test Lab with metrics from real runs; data-quality metrics with denominators; scoped CSV reports; purpose-limited verification with expiry and revocation; correction requests with separation of duties; users and roles; audit trail; integration status page.

## Limitations (read before relying on it)

- Not deployed from this environment: the public URL, Neon connectivity and Vercel runtime behaviour are unverified. Tests ran against PGlite (real Postgres semantics, in process) and a local HTTP server, not against Neon or Vercel.
- The browser UI was type-checked and built but not exercised in an automated browser test.
- No lint step is configured; `npm run typecheck` and tests are the gates.
- Rules in the seed (12-digit identifiers, intake cap, 30-day grace, 180-day staleness) are illustrative configuration, not real AICTE regulations.
- No APAAR, ABC, DigiLocker, AICTE or ERP integration exists. Verification reads internal records only and says so.
- The Admission Integrity view shows the current state plus a history of reconciliation runs; it does not yet reconstruct arbitrary past dates.
- Imports are limited to 2000 rows and 3 MB per file (Vercel body limit); split larger files. No background job queue exists.
- Identifiers are masked for state officers; other roles see full identifiers within their scope. Legal compliance (for example Indian data-protection requirements) has not been assessed.
- Optimistic locking covers record edits and case transitions; other writes are last-write-wins.

## Project review and demonstration notes

### What is implemented in this repository

- React/Vite interface with a public entry page, role-specific workspace navigation, forms, tables, reports and case workflows.
- A Vercel serverless API under `/api/*` backed by PostgreSQL.
- Deterministic rule evaluation, synthetic evaluation records, and tests for core engine/API behavior.
- Role and workspace checks are enforced in the server, not only by hiding interface controls.

### What must be configured before a public evaluation

A static frontend deployment alone is not enough to open a persistent evaluation workspace. Configure a PostgreSQL database and the environment variables in `.env.example` in Vercel. Without these, API requests can fail even while the landing page loads. Never put secrets in Vite `VITE_*` variables or commit a real `.env` file.

### Honest scope statement

LogicRed is an independent prototype, not an official AICTE/APAAR service. It currently uses synthetic evaluation records and deterministic rules. It does not claim live integration with APAAR, ABC, DigiLocker, AICTE, or institutional ERP systems. Seeded thresholds are illustrative and must not be represented as official regulations. Findings are indicators for authorized human review, not proof of misconduct.

### Suggested SIH review walkthrough

1. Open the evaluation workspace as a regulatory officer.
2. Review the overview and institution/programme registry.
3. Inspect a seeded reconciliation finding and its rule, version, calculation and evidence.
4. Open the associated case and review its status/history.
5. Run a rule simulation or Crash-Test Lab scenario and compare the before/after metrics.
6. Inspect data-quality metrics and a scoped report/export.
7. Show the Integration Health page and explicitly identify services as unconfigured unless a real integration has been implemented and tested.

### Quality gates

GitHub Actions runs `npm ci`, type-checking, tests and a production build on pushes and pull requests to `main`. A green CI run does not by itself prove the application is deployed or connected to a production database; verify the Vercel deployment and database-backed flows separately.
