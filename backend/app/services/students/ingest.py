"""
Student record ingestion (LogicRed).

Institution -> Student Data Upload -> APAAR Validation -> Data Verification
-> AICTE Central Repository.

Takes plain student dicts (single form, JSON API call or CSV row), normalises
them, runs the validation + anomaly engines, and stores the result in the same
record structure the rest of the platform (review queue, certificates, audit
trail) already understands.
"""
import re
from typing import Dict, List, Optional

from ... import models
from ...database import records_collection, documents_collection
from ..audit.service import log_audit
from ..validation.engine import run_validation
from ..anomaly.engine import compute_anomaly_score
from ..notifications.notifier import notify_high_risk_record

# Accepted CSV/JSON header aliases -> canonical field names
ALIASES = {
    "apaar": "apaar_id", "apaarid": "apaar_id", "apaar_id": "apaar_id",
    "name": "student_name", "studentname": "student_name",
    "studentid": "student_id", "enrollment_no": "student_id", "enrolment_no": "student_id",
    "date_of_birth": "dob", "birth_date": "dob",
    "aicte_id": "institution_id", "institute_id": "institution_id", "institution": "institution_name",
    "course": "program", "stream": "branch", "admission_year": "year_of_admission", "year": "year_of_admission",
    "category": "admission_category", "intake": "approved_intake",
    "enrolment": "actual_enrolment", "enrollment": "actual_enrolment", "actual_enrollment": "actual_enrolment",
    "supernumerary": "supernumerary_seat", "nri": "nri_category", "oci": "oci_status",
    "fn": "foreign_national", "phone": "mobile", "consent": "consent_given",
}


def normalise_row(row: dict) -> Dict[str, Optional[str]]:
    out: Dict[str, Optional[str]] = {}
    for k, v in row.items():
        key = re.sub(r"[\s\-]+", "_", str(k).strip().lower())
        key = ALIASES.get(key, key)
        if key in models.STUDENT_FIELDS:
            val = None if v is None else str(v).strip()
            out[key] = val or None
    if out.get("apaar_id"):
        out["apaar_id"] = re.sub(r"[\s\-]", "", out["apaar_id"])
    for f in models.YES_NO_FIELDS:
        v = (out.get(f) or "").lower()
        out[f] = "Yes" if v in ("yes", "y", "true", "1") else ("No" if v else "No")
    return {f: out.get(f) for f in models.STUDENT_FIELDS}


def _field_entries(values: Dict[str, Optional[str]], validations: List[dict]) -> List[dict]:
    status_by_field: Dict[str, str] = {}
    for v in validations:
        f = v["affected_field"]
        if not f:
            continue
        if v["status"] in ("FAIL", "WARNING"):
            status_by_field[f] = "FAIL" if (v["status"] == "FAIL" or status_by_field.get(f) == "FAIL") else "WARNING"
        else:
            status_by_field.setdefault(f, "PASS")
    entries = []
    for name in models.STUDENT_FIELDS:
        has = values.get(name) is not None
        entries.append({
            "id": models.gen_uuid(), "field_name": name, "value": values.get(name),
            # Structured submission (not OCR): full confidence when present.
            "confidence": 100.0 if has else 0.0,
            "ocr_confidence": 100.0 if has else 0.0,
            "extraction_confidence": 100.0 if has else 0.0,
            "confidence_band": "HIGH" if has else "VERIFY",
            "source_page": None, "source_bbox": None, "source_text": None,
            "review_reason": None if has else "Not provided in submission.",
            "validation_status": status_by_field.get(name, "PASS"),
        })
    return entries


async def create_batch_document(filename: str, file_type: str, size: int, user: dict) -> dict:
    doc = {
        "_id": models.gen_uuid(), "filename": filename, "stored_path": "", "file_type": file_type,
        "file_size_bytes": size, "status": models.DocumentStatus.PROCESSED.value,
        "uploaded_by": user["_id"], "uploaded_at": models.utcnow(), "processed_at": models.utcnow(),
        "error_message": None,
    }
    await documents_collection.insert_one(doc)
    await log_audit(action="UPLOAD", document_id=doc["_id"], user_id=user["_id"], metadata={"filename": filename})
    return doc


async def evaluate(record_id: str, values: Dict[str, Optional[str]]):
    validations = await run_validation(record_id, values)
    missing = len([1 for f in ("apaar_id", "student_name", "institution_id", "program") if not values.get(f)])
    score, level, reasons = compute_anomaly_score(validations, missing)
    has_issues = any(v["status"] in ("WARNING", "FAIL") for v in validations)
    status = models.RecordStatus.PENDING_REVIEW.value if has_issues else models.RecordStatus.AUTO_PASSED.value
    return validations, score, level, reasons, status


def _validation_docs(validations: List[dict]) -> List[dict]:
    return [{"id": models.gen_uuid(), **{k: v[k] for k in ("rule", "status", "severity", "message", "affected_field")},
             "created_at": models.utcnow()} for v in validations]


async def ingest_student(raw: dict, user: dict, document_id: str, source: str = "FORM") -> dict:
    values = normalise_row(raw)
    # An institution can only submit data for itself.
    if user["role"] == "INSTITUTION" and user.get("institution_id"):
        values["institution_id"] = user["institution_id"]
        values["institution_name"] = values.get("institution_name") or user.get("institution_name")

    record_id = models.gen_uuid()
    validations, score, level, reasons, status = await evaluate(record_id, values)
    entries = _field_entries(values, validations)
    overall = round(sum(f["confidence"] for f in entries) / len(entries), 1)

    record = {
        "_id": record_id, "document_id": document_id, "status": status,
        "overall_confidence": overall, "anomaly_score": score, "anomaly_level": level,
        "anomaly_reasons": reasons, "created_at": models.utcnow(), "verified_at": None,
        "verified_by": None, "fields": entries, "validations": _validation_docs(validations),
        "verification_actions": [], "submitted_by": user["_id"], "source": source,
    }
    await records_collection.insert_one(record)
    await log_audit(action="STUDENT_SUBMIT", record_id=record_id, document_id=document_id, user_id=user["_id"],
                    metadata={"source": source, "apaar_id": values.get("apaar_id"),
                              "institution_id": values.get("institution_id")})
    await log_audit(action="VALIDATION", record_id=record_id, document_id=document_id, user_id=user["_id"],
                    metadata={"rule_count": len(validations), "anomaly_level": level})
    if level == "HIGH":
        await notify_high_risk_record(record, student_name=values.get("student_name"), apaar_id=values.get("apaar_id"))
    return record


async def update_student(record: dict, raw: dict, user: dict) -> dict:
    """Update an existing submission (re-validated, previous verification reset)."""
    values = normalise_row(raw)
    old = {f["field_name"]: f["value"] for f in record["fields"]}
    values["apaar_id"] = old.get("apaar_id")  # APAAR ID is the immutable key
    if user["role"] == "INSTITUTION" and user.get("institution_id"):
        values["institution_id"] = user["institution_id"]
    for k in models.STUDENT_FIELDS:      # partial updates keep the existing value
        if values.get(k) is None and old.get(k) is not None and k not in raw and k not in models.YES_NO_FIELDS:
            values[k] = old[k]
    validations, score, level, reasons, status = await evaluate(record["_id"], values)
    entries = _field_entries(values, validations)
    changed = {k: [old.get(k), values.get(k)] for k in models.STUDENT_FIELDS if old.get(k) != values.get(k)}
    await records_collection.update_one({"_id": record["_id"]}, {"$set": {
        "fields": entries, "validations": _validation_docs(validations), "anomaly_score": score,
        "anomaly_level": level, "anomaly_reasons": reasons, "status": status,
        "verified_at": None, "verified_by": None, "signature_hash": None, "digital_signature": None,
    }})
    await log_audit(action="STUDENT_UPDATE", record_id=record["_id"], document_id=record["document_id"],
                    user_id=user["_id"], metadata={"changed_fields": changed})
    return await records_collection.find_one({"_id": record["_id"]})
