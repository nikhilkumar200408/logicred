# APAAR SUTRA — Academic Record Reconciliation

> SIH project repository for reconciling approved institutional intake with reported enrolments, flagging potential cross-institution conflicts, and tracking evidence-backed discrepancy cases.

## Project status

This repository is being prepared for evaluation. Treat all records in the evaluation workspace as synthetic unless explicitly documented otherwise. A discrepancy is a review signal, not proof of wrongdoing. External integrations must be configured before they can be considered operational.

## Intended capabilities

- Reconciliation of approved intake against reported enrolment
- Explainable policy rules with versioning and simulation
- Evidence-backed case management and field-level record history
- Synthetic evaluation workspace for reviewers
- Optional integrations, clearly marked when unconfigured

## Technology

The application package is intended to use React, TypeScript, Vite, a Node.js API and PostgreSQL. See the application source and `.env.example` for the exact implementation and configuration once uploaded.

## Local setup

1. Install Node.js LTS and npm.
2. Install dependencies with `npm ci`.
3. Copy `.env.example` to `.env` and set the required database and server values.
4. Run the development script documented in `package.json`.
5. Run the test script before submitting changes.

Do not commit `.env`, access tokens, real student records, API keys or production credentials.

## Vercel deployment

Import this repository into Vercel and configure the required environment variables in Project Settings. Provision PostgreSQL separately and apply the documented migrations before enabling database-backed workflows. Verify build logs, API routes, authentication, and database connectivity after deployment. A successful frontend deployment alone does not prove the backend is operational.

## Evaluation checklist

- [ ] Production build completes successfully
- [ ] Automated tests pass
- [ ] Synthetic data is clearly labelled
- [ ] Reconciliation calculations are reproducible and explainable
- [ ] Discrepancies link to evidence and rule versions
- [ ] Authentication and secrets are server-side only
- [ ] Unconfigured integrations are not presented as live
- [ ] No real student data or credentials are committed
- [ ] Deployed frontend and API are tested end-to-end

## Responsible interpretation

Automated flags are intended to support human review. They must not be presented as a finding of fraud, misconduct or guilt without independent verification and due process.

## License

No license has been specified yet. Until one is added, reuse and redistribution permissions are not granted by default.