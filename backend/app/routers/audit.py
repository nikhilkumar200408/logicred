from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from .. import schemas
from ..database import audit_collection
from ..deps import get_current_user

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=List[schemas.AuditLogOut])
async def list_audit_logs(
    action: Optional[str] = Query(None),
    limit: int = Query(200, le=1000),
    user: dict = Depends(get_current_user),
):
    query = {"action": action} if action else {}
    cursor = audit_collection.find(query).sort("timestamp", -1).limit(limit)
    logs = []
    async for log in cursor:
        logs.append(schemas.AuditLogOut(
            id=log["_id"], record_id=log.get("record_id"), document_id=log.get("document_id"),
            action=log["action"], user_id=log.get("user_id"), old_value=log.get("old_value"),
            new_value=log.get("new_value"), log_metadata=log.get("log_metadata", {}), timestamp=log["timestamp"],
        ))
    return logs
