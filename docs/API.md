# LogicRed API

Base URL `http://localhost:8000` — interactive docs at `/docs`. All endpoints (except `public-verify`) need
`Authorization: Bearer <token>` from `POST /api/auth/login`.

## Roles
| Role | Purpose |
|------|---------|
| `INSTITUTION` | Approved institution: submits/updates its own students, sees only its own records |
| `AICTE_OFFICER` | Reviews flagged records, edits fields, approves with digital signature |
| `ADMIN` | AICTE admin: all data, dashboards, user activity, reports |
| `EMPLOYER` | External verifier (employers/regulators): APAAR lookup only |

## Student data submission
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/api/students` | INSTITUTION, ADMIN | One student (JSON, field names as in the CSV template) |
| POST | `/api/students/bulk` | INSTITUTION, ADMIN | `{ "students": [ ... ] }` — ERP/LMS system integration |
| POST | `/api/students/upload-csv` | INSTITUTION, ADMIN | CSV upload (multipart `file`) |
| PUT  | `/api/students/{apaar_id}` | INSTITUTION, ADMIN | Update a submitted record (re-validated, verification reset) |
| GET  | `/api/students/template.csv` | any | CSV template |

Student fields: `apaar_id, student_name, student_id, dob, gender, institution_id, institution_name, program, branch,
year_of_admission, admission_category, approved_intake, actual_enrolment, supernumerary_seat, nri_category,
oci_status, foreign_national, nationality, email, mobile, consent_given`.

Every submission returns per-row `status`, `anomaly_level` and human-readable `issues`.

## Automated validation rules
`missing_apaar_id`, `invalid_apaar_id` (12 digits), `duplicate_student_record`, `cross_institution_duplicate`,
`admissions_exceed_intake` (supernumerary seats excluded), `intake_mismatch_with_registry`,
`declared_enrolment_exceeds_intake`, `inconsistent_oci_fn`, `inconsistent_nri_fn`, `inconsistent_supernumerary`,
`inconsistent_nationality`, `consent_missing`, plus required-field / DOB / year / email / mobile format checks.

## Review, verification & reports
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/records`, `/api/records/{id}` | any internal | Records (institutions are scoped to their own) |
| PATCH | `/api/records/{id}/fields/{field}` | INSTITUTION, AICTE_OFFICER, ADMIN | Correct a field |
| POST | `/api/records/{id}/verify` | AICTE_OFFICER | `{action: APPROVE\|REJECT\|MARK_UNRESOLVED, signature}` — APPROVE creates the SHA-256 signed verifiable record |
| GET | `/api/verify/{apaar_id}` | ADMIN, AICTE_OFFICER, INSTITUTION, EMPLOYER | Authorised APAAR lookup; consent-aware masking; audited |
| GET | `/api/records/public-verify/{id}` | public | QR-code certificate check (status + hash only, no PII) |
| GET | `/api/dashboard/stats` | any internal | Record/validation statistics |
| GET | `/api/dashboard/admissions?year=` | any internal | Approved intake vs enrolment, supernumerary/NRI/OCI/FN counts, flag counts |
| GET | `/api/dashboard/officer-queue?risk=flagged\|all` | any internal | Review queue |
| GET | `/api/dashboard/export.csv?status=&institution=` | any internal | Policy / accreditation / regulatory report export |
| GET | `/api/dashboard/user-activity` | ADMIN | Per-user audit activity |
| GET | `/api/audit` | any internal | Audit trail |

## Scanned admission lists (optional OCR path)
`POST /api/documents/upload` → `POST /api/documents/{id}/process` — OCR + extraction into the same student record schema.
