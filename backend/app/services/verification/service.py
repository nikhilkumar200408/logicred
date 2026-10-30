import hashlib
from typing import Optional

from ... import models
from ...database import records_collection
from ..audit.service import log_audit
from ..confidence.engine import compute_overall_confidence


async def edit_field(
    record: dict,
    field_name: str,
    new_value: str,
    user: dict,
    reason: Optional[str] = None,
) -> dict:
    """Edits one embedded field on a record, bumps it to HIGH confidence to
    reflect human verification, recomputes overall confidence, appends a
    VerificationAction, and writes the change back to Mongo atomically."""
    old_value = None
    updated_fields = []
    for f in record["fields"]:
        if f["field_name"] == field_name:
            old_value = f["value"]
            f = {
                **f,
                "value": new_value,
                "validation_status": "PASS",
                "confidence": 100.0,
                "confidence_band": models.ConfidenceBand.HIGH.value,
            }
        updated_fields.append(f)

    overall_confidence = compute_overall_confidence([f["confidence"] for f in updated_fields])

    action = {
        "id": models.gen_uuid(),
        "action": "EDIT",
        "field_name": field_name,
        "old_value": old_value,
        "new_value": new_value,
        "reason": reason,
        "user_id": user["_id"],
        "timestamp": models.utcnow(),
    }

    await records_collection.update_one(
        {"_id": record["_id"]},
        {
            "$set": {"fields": updated_fields, "overall_confidence": overall_confidence},
            "$push": {"verification_actions": action},
        },
    )

    await log_audit(
        action="EDIT",
        record_id=record["_id"],
        document_id=record["document_id"],
        user_id=user["_id"],
        old_value=old_value,
        new_value=new_value,
        metadata={"field_name": field_name, "reason": reason},
    )

    updated_field = next(f for f in updated_fields if f["field_name"] == field_name)
    return updated_field


async def apply_verification_action(
    record: dict,
    action: str,
    user: dict,
    reason: Optional[str] = None,
    signature: Optional[str] = None,
) -> dict:
    action = action.upper()
    if action not in ("APPROVE", "REJECT", "MARK_UNRESOLVED"):
        raise ValueError(f"Unknown verification action: {action}")

    if action == "APPROVE" and not signature:
        raise ValueError("A digital signature is required to approve a record.")

    update: dict = {}
    signature_hash = None
    if action == "APPROVE":
        # Lightweight cryptographic integrity proof: the record is
        # permanently bound to the signer, the timestamp, and the exact
        # signature image via a SHA-256 digest. The raw signature image is
        # stored once on the record (digital_signature); the hash is what
        # travels with every audit/action entry so tampering is detectable.
        signed_at = models.utcnow()
        signature_hash = hashlib.sha256(
            f"{record['_id']}|{user['_id']}|{signed_at.isoformat()}|{signature}".encode("utf-8")
        ).hexdigest()
        update["status"] = models.RecordStatus.VERIFIED.value
        update["verified_at"] = signed_at
        update["verified_by"] = user["_id"]
        update["digital_signature"] = signature
        update["signature_hash"] = signature_hash
    elif action == "REJECT":
        update["status"] = models.RecordStatus.REJECTED.value
    elif action == "MARK_UNRESOLVED":
        update["status"] = models.RecordStatus.UNRESOLVED.value

    va = {
        "id": models.gen_uuid(),
        "action": action,
        "field_name": None,
        "old_value": None,
        "new_value": None,
        "reason": reason,
        "user_id": user["_id"],
        "timestamp": models.utcnow(),
        "signature_hash": signature_hash,
    }

    await records_collection.update_one(
        {"_id": record["_id"]},
        {"$set": update, "$push": {"verification_actions": va}},
    )

    await log_audit(
        action=action,
        record_id=record["_id"],
        document_id=record["document_id"],
        user_id=user["_id"],
        metadata={"reason": reason, "signature_hash": signature_hash},
    )

    return va
