# LogicRed — Architecture

```
Institution ─► Student Data Upload ─► APAAR Validation ─► Data Verification ─► AICTE Central Repository
 (CSV / JSON API /     (routers/students.py)  (services/validation)   (AICTE officer review    (MongoDB `records`)
  form / OCR scan)                             + anomaly engine        + SHA-256 signature)           │
                                                                                                     ▼
                              Authorised verification  ◄──  Analytics & monitoring dashboards  ◄─────┘
                              (GET /api/verify/{apaar})     (/api/dashboard/*, CSV reports)
```

* **Backend** — FastAPI + MongoDB (Motor). `services/students/ingest.py` normalises rows, runs
  `services/validation/engine.py` (APAAR format, duplicates, intake limits, category consistency, cross-institution
  duplicate enrolment) and `services/anomaly/engine.py` (explainable 0-100 inconsistency score).
* **Security** — JWT auth, role-based access control (`deps.require_roles`, `deps.scope_query` limits an institution to
  its own data), audit trail on every submit/update/verify/lookup, consent flag per student with consent-aware masking
  on verification lookups, public QR check exposes no personal data.
* **Verifiable records** — an AICTE officer approval creates a SHA-256 signature hash bound to record, officer and time;
  the printable certificate shows `APAAR ID | Student ID` (what degree-awarding bodies should print) and a QR code.
* **Integration** — REST/OpenAPI (`/docs`); `POST /api/students/bulk` for ERP/LMS pushes; CSV export for reports.
* **Frontend** — Next.js dashboards for institutions, AICTE, and external verifiers.
* **Optional OCR path** — scanned admission lists go through OpenCV + Tesseract + regex extraction into the same schema.
