# LogicRed

### APAAR-based Student Data Management & Verification System for AICTE
**Institution → Student Data Upload → APAAR Validation → Data Verification → AICTE Central Repository → Analytics & Monitoring → Authorized Verification**

LogicRed gives AICTE a single place where approved institutions submit student-level admission data keyed by
**APAAR ID**, with automated validation, anomaly detection, real-time dashboards and secure, consent-aware verification.
(Built on the earlier BhoomiTrust-AI validate → score → verify → audit framework, re-targeted to this problem statement.)

## Problem-statement coverage

| # | Requirement | Where |
|---|-------------|-------|
| 1 | Secure platform/API to upload & update student data by APAAR ID | `POST /api/students`, `/bulk`, `/upload-csv`, `PUT /api/students/{apaar_id}`; UI **Student Data Upload** |
| 2 | Fields: approved intake, actual enrolment, supernumerary, NRI, OCI, FN, others | 21-field schema (`backend/app/models.py`) |
| 3 | Automated validation (duplicates, invalid/missing APAAR, intake excess, inconsistencies, cross-institution duplicates) | `services/validation/engine.py` |
| 4 | Dashboards for AICTE & institutions | Dashboard → **Real-time Admissions Monitor** + stats, review queue |
| 5 | Secure verification for AICTE, institutions, employers, regulators | `GET /api/verify/{apaar_id}` + UI **Verify APAAR ID** (RBAC, consent masking, audited) |
| 6 | Verifiable student records | AICTE officer approval → SHA-256 signed record + QR certificate |
| 7 | Integration/API | REST + OpenAPI `/docs`, bulk JSON endpoint for ERP/LMS |
| 8 | Security, privacy, RBAC, audit, consent | JWT, 4 roles, institution data scoping, audit trail, per-student consent |
| 9 | Reports | `GET /api/dashboard/export.csv`, `/api/dashboard/admissions` |
| 10 | APAAR ID + Student ID on certificates | Certificate page prints `APAAR ID \| Student ID` |
| – | Innovation: intelligent anomaly detection | explainable 0-100 inconsistency score; optional OCR path for scanned admission lists |

## Run it

```bash
cp .env.example .env
docker compose up --build        # frontend :3000, API docs :8000/docs (auto-seeds demo data)
```
Local: `./setup.sh` once, then `./start_all.sh`. Tests: `cd backend && pytest`.

## Demo logins (seeded)

| Role | Username | Password |
|------|----------|----------|
| AICTE Admin | `admin` | `Admin@123` |
| AICTE Officer | `aicte_officer` | `Officer@123` |
| Institution (Sample Institute of Technology) | `institution1` | `Institution@123` |
| Institution (Demo College of Engineering) | `institution2` | `Institution@123` |
| Employer / Regulator | `employer` | `Employer@123` |

Seed data (`backend/sample_data/students_sample.csv`) intentionally triggers intake overflow, invalid APAAR ID,
cross-institution duplicate, category inconsistency and missing consent — see `sample-data/README.md`.

## Docs
`docs/API.md` · `docs/ARCHITECTURE.md` · `database/schema.md`

Automated checks flag **potential inconsistencies** that need official verification; they are not a regulatory finding.
