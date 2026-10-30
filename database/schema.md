# LogicRed — MongoDB schema

Database `logicred_db`. Schemaless documents, validated by Pydantic at the API boundary.

- **users** — `{_id, username, full_name, hashed_password, role, institution_id?, institution_name?, created_at}`
  with role in `ADMIN | INSTITUTION | AICTE_OFFICER | EMPLOYER`.
- **institutions** — AICTE registry: `{_id: institution_id, name, state, approved_intake: {program: n}}`.
- **documents** — one per submission batch (CSV / API call / scanned form): `{_id, filename, file_type, file_size_bytes, status, uploaded_by, uploaded_at}`.
- **records** — one per student admission (the AICTE central repository):
  `{_id, document_id, status, overall_confidence, anomaly_score, anomaly_level, anomaly_reasons, created_at,
  verified_at, verified_by, signature_hash, submitted_by, source,
  fields: [{field_name, value, confidence, validation_status, ...}],
  validations: [{rule, status, severity, message, affected_field}],
  verification_actions: [...]}`.
  Student fields: apaar_id, student_name, student_id, dob, gender, institution_id, institution_name, program, branch,
  year_of_admission, admission_category, approved_intake, actual_enrolment, supernumerary_seat, nri_category,
  oci_status, foreign_national, nationality, email, mobile, consent_given.
- **audit** — append-only trail: `{_id, record_id, document_id, action, user_id, old_value, new_value, log_metadata, timestamp}`
  (STUDENT_SUBMIT, STUDENT_UPDATE, VALIDATION, EDIT, APPROVE/REJECT, VERIFY_LOOKUP, ...).
