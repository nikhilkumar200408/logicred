# Architecture overview

LogicRed is a prototype for reconciling approved intake with reported enrolments and managing resulting review cases.

```text
Browser (React + Vite)
        |
        | same-origin /api requests
        v
Vercel serverless API (api/[...path].ts)
        |
        +--> role/session checks and route handlers
        +--> deterministic reconciliation and policy engine
        +--> PostgreSQL (schema migrations + workspace-scoped records)
```

## Trust boundaries

- The browser is not an authorization boundary. Protected operations must be checked by the API.
- Sessions are signed and held in an HttpOnly cookie; role and workspace scope are enforced server-side.
- The evaluation workspace is separate from production workspaces and uses synthetic seeded records.
- Rule thresholds in the seed data are illustrative configuration, not official AICTE regulations.
- The prototype does not currently connect to APAAR, ABC, DigiLocker, AICTE or institutional ERP systems. The integration screen reports unconfigured services honestly.

## Deployment requirements

Vercel serves the built Vite frontend and the API function. A reachable PostgreSQL database is required for persistent workspaces. Configure `DATABASE_URL` and a unique `SESSION_SECRET` in the Vercel project environment before enabling the evaluation workspace. See the root README and `.env.example`.
