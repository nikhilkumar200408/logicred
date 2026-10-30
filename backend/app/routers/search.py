from typing import List
import re

from fastapi import APIRouter, Depends, Query

from .. import schemas
from ..database import records_collection
from ..deps import get_current_user, scope_query

router = APIRouter(prefix="/api/search", tags=["search"])

SEARCHABLE_FIELDS = ["student_name", "apaar_id", "student_id", "institution_name", "institution_id", "program"]


@router.get("", response_model=List[schemas.SearchResultItem])
async def search(q: str = Query(..., min_length=1), user: dict = Depends(get_current_user)):
    sq = scope_query(user)
    cursor = records_collection.find(
        {"$and": [sq or {}, {
            "fields": {
                "$elemMatch": {
                    "field_name": {"$in": SEARCHABLE_FIELDS},
                    "value": {"$regex": re.escape(q), "$options": "i"},
                }
            }
        }]}
    )

    results: List[schemas.SearchResultItem] = []
    async for record in cursor:
        field_map = {f["field_name"]: f["value"] for f in record["fields"]}
        results.append(
            schemas.SearchResultItem(
                record_id=record["_id"],
                document_id=record["document_id"],
                student_name=field_map.get("student_name"),
                apaar_id=field_map.get("apaar_id"),
                student_id=field_map.get("student_id"),
                institution_name=field_map.get("institution_name"),
                program=field_map.get("program"),
                year_of_admission=field_map.get("year_of_admission"),
                status=record["status"],
                overall_confidence=record["overall_confidence"],
            )
        )
    return results
