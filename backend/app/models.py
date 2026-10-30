"""
Domain enums and record-shape constants for LogicRed (APAAR-based Student Data Management & Verification System for AICTE).

MongoDB is schemaless, so there are no ORM model classes here anymore —
documents are plain dicts validated against the Pydantic schemas in
schemas.py at the API boundary. This module keeps the shared enums/constants
so the rest of the codebase (routers, services) can still write
`models.UserRole.ADMIN`, `models.RecordStatus.VERIFIED`, etc.
"""
import enum
import uuid
from datetime import datetime


def gen_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.utcnow()


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"                  # AICTE administrator
    INSTITUTION = "INSTITUTION"      # AICTE-approved institution (data submitter)
    AICTE_OFFICER = "AICTE_OFFICER"  # AICTE verification officer
    EMPLOYER = "EMPLOYER"            # authorised external verifier (employers, regulators)


class DocumentStatus(str, enum.Enum):
    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"


class RecordStatus(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    AUTO_PASSED = "AUTO_PASSED"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    UNRESOLVED = "UNRESOLVED"


class ConfidenceBand(str, enum.Enum):
    HIGH = "HIGH"
    REVIEW = "REVIEW"
    VERIFY = "VERIFY"


STUDENT_FIELDS = [
    "apaar_id", "student_name", "student_id", "dob", "gender",
    "institution_id", "institution_name", "program", "branch",
    "year_of_admission", "admission_category", "approved_intake",
    "actual_enrolment", "supernumerary_seat", "nri_category", "oci_status",
    "foreign_national", "nationality", "email", "mobile", "consent_given",
]

# Fields whose value is a Yes/No flag (normalised on ingest).
YES_NO_FIELDS = ["supernumerary_seat", "nri_category", "oci_status", "foreign_national", "consent_given"]

# ---------------------------------------------------------------------------
# Document shape reference (each is a plain dict stored in its collection):
#
# users:      {_id, username, full_name, hashed_password, role, created_at}
#
# documents:  {_id, filename, stored_path, file_type, file_size_bytes,
#              status, uploaded_by, uploaded_at, processed_at,
#              error_message}
#
# records:    {_id, document_id, status, overall_confidence, anomaly_score,
#              anomaly_level, anomaly_reasons, created_at, verified_at,
#              verified_by,
#              fields: [ {id, field_name, value, confidence, ocr_confidence,
#                         extraction_confidence, confidence_band,
#                         source_page, source_bbox, source_text,
#                         review_reason, validation_status} ],
#              validations: [ {id, rule, status, severity, message,
#                              affected_field, created_at} ],
#              verification_actions: [ {id, action, field_name, old_value,
#                                       new_value, reason, user_id,
#                                       timestamp} ]}
#
# audit:      {_id, record_id, document_id, action, user_id, old_value,
#              new_value, log_metadata, timestamp}
# ---------------------------------------------------------------------------
