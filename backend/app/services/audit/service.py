from typing import Optional

from ... import models
from ...database import audit_collection


async def log_audit(
    action: str,
    record_id: Optional[str] = None,
    document_id: Optional[str] = None,
    user_id: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> dict:
    entry = {
        "_id": models.gen_uuid(),
        "record_id": record_id,
        "document_id": document_id,
        "action": action,
        "user_id": user_id,
        "old_value": old_value,
        "new_value": new_value,
        "log_metadata": metadata or {},
        "timestamp": models.utcnow(),
    }
    await audit_collection.insert_one(entry)
    return entry
