"""
Orchestrates the full P0 pipeline:

Scanned admission list/form -> Preprocess -> OCR -> AI Extraction -> Confidence
-> APAAR Validation -> Anomaly -> Student Record ready for AICTE Verification
(structured CSV/JSON/API submissions skip OCR: see services/students/ingest.py)

This module is intentionally the single place that wires the modular
services together, so each service stays independently testable.
"""
from typing import Optional

from .. import models
from ..database import documents_collection, records_collection
from .audit.service import log_audit
from .notifications.notifier import notify_high_risk_record
from .ocr import get_ocr_provider
from .extraction import get_extraction_provider
from .confidence.engine import compute_field_confidence, band_for_confidence, compute_overall_confidence
from .validation.engine import run_validation
from .anomaly.engine import compute_anomaly_score


class ProcessingError(Exception):
    pass


async def process_document(document: dict, user: Optional[dict] = None) -> dict:
    document_id = document["_id"]
    user_id = user["_id"] if user else None

    await documents_collection.update_one(
        {"_id": document_id}, {"$set": {"status": models.DocumentStatus.PROCESSING.value}}
    )

    try:
        ocr_provider = get_ocr_provider()
        ocr_spans = ocr_provider.extract(document.get("stored_path") or document["filename"])

        if not ocr_spans:
            raise ProcessingError("Unable to confidently process. Manual review required.")

        await log_audit(
            action="OCR", document_id=document_id, user_id=user_id,
            metadata={"provider": ocr_provider.name, "span_count": len(ocr_spans)},
        )

        extraction_provider = get_extraction_provider()
        extracted = extraction_provider.extract_fields(ocr_spans)

        await log_audit(
            action="EXTRACTION", document_id=document_id, user_id=user_id,
            metadata={"provider": extraction_provider.name, "field_count": len(extracted)},
        )

        for item in extracted:
            if item["field_name"] == "apaar_id" and item["value"]:
                item["value"] = "".join(item["value"].split()).replace("-", "")

        record_id = models.gen_uuid()
        record_fields = []
        field_confidences = []
        low_conf_count = 0
        field_value_map = {}

        for item in extracted:
            has_value = item["value"] is not None
            score = compute_field_confidence(item["ocr_confidence"], item["extraction_confidence"], has_value)
            band = band_for_confidence(score, has_value)
            if band != models.ConfidenceBand.HIGH:
                low_conf_count += 1

            record_fields.append({
                "id": models.gen_uuid(),
                "field_name": item["field_name"],
                "value": item["value"],
                "confidence": score,
                "ocr_confidence": round(item["ocr_confidence"] * 100, 1),
                "extraction_confidence": round(item["extraction_confidence"] * 100, 1),
                "confidence_band": band.value,
                "source_page": item["source_page"],
                "source_bbox": item["source_bbox"],
                "source_text": item["source_text"],
                "review_reason": item["review_reason"],
                "validation_status": "UNVALIDATED",
            })
            field_confidences.append(score)
            field_value_map[item["field_name"]] = item["value"]

        validation_outcomes = await run_validation(record_id, field_value_map)

        record_validations = []
        fields_by_name = {f["field_name"]: f for f in record_fields}
        for outcome in validation_outcomes:
            record_validations.append({
                "id": models.gen_uuid(),
                "rule": outcome["rule"],
                "status": outcome["status"],
                "severity": outcome["severity"],
                "message": outcome["message"],
                "affected_field": outcome["affected_field"],
                "created_at": models.utcnow(),
            })
            if outcome["affected_field"] and outcome["affected_field"] in fields_by_name:
                f = fields_by_name[outcome["affected_field"]]
                if outcome["status"] in ("WARNING", "FAIL"):
                    f["validation_status"] = outcome["status"]
                elif f["validation_status"] == "UNVALIDATED":
                    f["validation_status"] = "PASS"

        for f in fields_by_name.values():
            if f["validation_status"] == "UNVALIDATED":
                f["validation_status"] = "PASS"

        await log_audit(
            action="VALIDATION", record_id=record_id, document_id=document_id,
            user_id=user_id,
            metadata={"rule_count": len(validation_outcomes)},
        )

        anomaly_score, anomaly_level, anomaly_reasons = compute_anomaly_score(validation_outcomes, low_conf_count)

        overall_confidence = compute_overall_confidence(field_confidences)

        has_issues = any(v["status"] in ("WARNING", "FAIL") for v in validation_outcomes)
        if overall_confidence >= 90 and not has_issues:
            record_status = models.RecordStatus.AUTO_PASSED.value
        else:
            record_status = models.RecordStatus.PENDING_REVIEW.value

        record = {
            "_id": record_id,
            "document_id": document_id,
            "status": record_status,
            "overall_confidence": overall_confidence,
            "anomaly_score": anomaly_score,
            "anomaly_level": anomaly_level,
            "anomaly_reasons": anomaly_reasons,
            "created_at": models.utcnow(),
            "verified_at": None,
            "verified_by": None,
            "fields": record_fields,
            "validations": record_validations,
            "verification_actions": [],
        }
        await records_collection.insert_one(record)

        await documents_collection.update_one(
            {"_id": document_id},
            {"$set": {"status": models.DocumentStatus.PROCESSED.value, "processed_at": models.utcnow()}},
        )

        if anomaly_level == "HIGH":
            await notify_high_risk_record(
                record,
                student_name=field_value_map.get("student_name"),
                apaar_id=field_value_map.get("apaar_id"),
            )

        return record

    except Exception as e:  # noqa: BLE001
        await documents_collection.update_one(
            {"_id": document_id},
            {
                "$set": {
                    "status": models.DocumentStatus.FAILED.value,
                    "error_message": str(e) or "Unable to confidently process. Manual review required.",
                }
            },
        )
        raise
