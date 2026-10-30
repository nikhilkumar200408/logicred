# Sample data

The runnable demo dataset is `backend/sample_data/students_sample.csv`. It is loaded by
`python -m app.seed_real_data` through the real ingestion + validation pipeline and deliberately contains:

| Row(s) | What it demonstrates |
|--------|----------------------|
| 3rd regular-seat student at Sample Institute (intake = 2) | `admissions_exceed_intake` |
| `11112222` | `invalid_apaar_id` (not 12 digits) |
| `111122223331` at two institutions | `cross_institution_duplicate` |
| Li Wei with OCI = No / FN = Yes on a supernumerary seat | valid foreign-national admission (no flag) |
| Meera Iyer with NRI = Yes + OCI = Yes on a regular seat | category/seat inconsistency review |
| Arjun Nair with consent = No | `consent_missing` |

Download a blank template from the UI (**Student Data Upload → CSV template**) or `GET /api/students/template.csv`.
