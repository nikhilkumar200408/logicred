# LogicRed — SIH 2026 Submission & Presentation Notes

## Project identity
- **Project:** LogicRed
- **Problem statement:** SIH 2026 PS 26263
- **Domain:** AICTE / APAAR student admission data verification
- **Repository:** https://github.com/nikhilkumar200408/logicred
- **Live application:** https://logicred.vercel.app
- **API documentation:** https://logicred-api-nikhil-s-projects22.vercel.app/docs

## 90-second product walkthrough
1. **Admissions dashboard:** explain institution/program-wise intake, utilization, pending verification and anomaly flags.
2. **Student data upload:** show CSV template/bulk upload and the structured single-student form.
3. **Upload & digitize:** demonstrate the drag-and-drop document intake workflow and describe OCR/extraction as the digitization stage.
4. **Human verification:** compare extracted values with the source document, inspect confidence and Pass/Fail/Warning indicators, edit uncertain fields and explain the authorized approval step.
5. **Close:** show API docs and explain role-based access, consent-aware verification and auditability.

## Screenshot evidence

Place the four original product screenshots in `docs/screenshots/` using these exact names:

| Filename | Screen |
|---|---|
| `01-admissions-dashboard.png` | Real-time Admissions Monitor |
| `02-student-data-upload.png` | Bulk CSV and single student entry |
| `03-upload-digitize.png` | Drag-and-drop document digitization |
| `04-human-verification.png` | Extracted record and human review |

The README gallery is already wired to these paths. Keep the screenshots genuine and unaltered; do not present generated concept art as a real application screen.

## Judge-facing highlights
- APAAR ID is the key for student-level records.
- Validation flags duplicates, missing/invalid identifiers, intake excess and cross-institution inconsistencies.
- Institutions can submit structured data; the digitization workflow supports scanned admission documents.
- Human review remains a deliberate control before official verification.
- Dashboard views help identify institution/program-level admission anomalies.
- APIs support integration with institutional systems.

## Important demo limitations to disclose
- Automated validation flags potential inconsistencies; it is not an official regulatory decision.
- The current hosted demo uses an in-memory mock data store in demo mode. Data persistence across serverless restarts is not guaranteed. Do not claim production-grade persistent storage until a durable database is configured and tested.
- OCR extraction and confidence values should be described according to the actual implemented pipeline and test evidence. Do not claim an external OCR/AI provider integration unless it is configured and demonstrated.
- A screenshot showing “Original file is not available on this server” should be explained as a demo-storage limitation, not as successful permanent document archival.

## Final pre-submission checklist
- [ ] Upload the four original screenshots to `docs/screenshots/`.
- [ ] Verify the public frontend and API docs from a fresh browser session.
- [ ] Test registration and login using the currently provisioned demo credentials.
- [ ] Test one valid record, one duplicate APAAR ID and one intake-excess case.
- [ ] Verify CSV export and role-based access.
- [ ] Confirm no secrets, tokens, personal student data or real credentials are committed.
- [ ] Replace sample names, emails, IDs and institution data with clearly synthetic demo data.
- [ ] Add team member names, institute name and mentor details to the final PPT/submission form.
