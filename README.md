# LogicRed — APAAR Student Data Verification Platform

> **Smart India Hackathon | Problem Statement 26263**  
> AI-powered student admission data validation, anomaly detection, human verification and analytics for AICTE.

**Verify · Analyze · Empower**

[![Live Frontend](https://img.shields.io/badge/Live%20Demo-logicred.vercel.app-2563eb?style=for-the-badge)](https://logicred.vercel.app) [![API Docs](https://img.shields.io/badge/API%20Docs-FastAPI-059669?style=for-the-badge)](https://logicred-api-nikhil-s-projects22.vercel.app/docs) [![Source Code](https://img.shields.io/badge/GitHub-Source-111827?style=for-the-badge)](https://github.com/nikhilkumar200408/logicred)

## What LogicRed does

LogicRed provides a centralized workflow for AICTE-approved institutions to submit student admission data keyed by APAAR ID. It combines structured CSV/manual entry, document digitization, rule-based validation, anomaly flags, human review and admission monitoring.

### Product walkthrough

| Admissions monitoring dashboard | Student data entry |
|---|---|
| ![LogicRed dashboard](docs/screenshots/01-admissions-dashboard.png) | ![Student data upload](docs/screenshots/02-student-data-upload.png) |

| Document digitization | Human verification |
|---|---|
| ![Upload and digitize](docs/screenshots/03-upload-digitize.png) | ![Human verification](docs/screenshots/04-human-verification.png) |

> Screenshots are intended to be stored in `docs/screenshots/`. See [SIH submission notes](docs/SIH_SUBMISSION.md) for the presentation flow and evidence checklist.

## Key capabilities

- **Institutional student-data intake:** single-record entry and bulk CSV upload.
- **APAAR-centric validation:** missing/invalid IDs, duplicate records, intake excess and cross-institution inconsistencies are flagged.
- **Document digitization workflow:** drag-and-drop scanned admission documents with OCR-oriented extraction flow.
- **Human-in-the-loop verification:** reviewers compare extracted fields with source evidence, edit uncertain values and approve/reject records.
- **Admissions analytics:** institution/program intake utilization, pending verification and anomaly monitoring.
- **Role-based access:** institution, employer and privileged AICTE roles with protected administrative access.
- **API integration:** REST endpoints and interactive OpenAPI documentation.

## Problem-statement coverage

| Requirement | LogicRed implementation |
|---|---|
| Upload/update student data by APAAR ID | Student entry, bulk CSV and student APIs |
| Capture admission and category fields | Student schema includes intake, enrolment, supernumerary, NRI, OCI and foreign-national fields |
| Detect inconsistent records | Duplicate, missing/invalid APAAR, intake and cross-institution validation flags |
| Dashboards for monitoring | Admissions monitor, institution/program table and verification metrics |
| Authorized verification | Role-aware verification workflow and consent-aware record handling |
| Integration | REST API and OpenAPI docs |
| Reports | Dashboard CSV export |
| Human oversight | Human verification stage before official sign-off |

Automated checks identify **potential inconsistencies only**. They do not make regulatory findings or replace AICTE Officer verification and digital sign-off.

## Demo links

- **Frontend:** https://logicred.vercel.app
- **Registration:** https://logicred.vercel.app/register
- **Login:** https://logicred.vercel.app/login
- **Backend health:** https://logicred-api-nikhil-s-projects22.vercel.app/api/health
- **API documentation:** https://logicred-api-nikhil-s-projects22.vercel.app/docs

## Run locally

```bash
cp .env.example .env
docker compose up --build
```

Frontend: `http://localhost:3000` · API docs: `http://localhost:8000/docs`

## Repository documentation

- [SIH submission notes and presentation checklist](docs/SIH_SUBMISSION.md)
- [API documentation](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database schema](database/schema.md)

## Team / submission

**Project:** LogicRed  
**Repository:** https://github.com/nikhilkumar200408/logicred  
**Live demo:** https://logicred.vercel.app

For a judge walkthrough, start with the admissions dashboard, upload a CSV or enter a student record, demonstrate document digitization, then show the human verification screen and explain why automated flags always require authorized review.
