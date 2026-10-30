"""
Student data submission + verification API (LogicRed).

POST /api/students            single student (JSON)
POST /api/students/bulk       JSON array of students (system-to-system integration)
POST /api/students/upload-csv CSV file upload (institution portal)
PUT  /api/students/{apaar_id} update a submitted record
GET  /api/students/template.csv   CSV template
GET  /api/verify/{apaar_id}   authorised verification (AICTE / institution / employer / regulator)
"""
import csv
import io
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from .. import models, schemas
from ..database import records_collection
from ..deps import get_current_user, require_roles, scope_query
from ..services.audit.service import log_audit
from ..services.students.ingest import ingest_student, update_student, create_batch_document, normalise_row

router = APIRouter(prefix="/api/students", tags=["students"])
verify_router = APIRouter(prefix="/api/verify", tags=["verification"])

SUBMITTERS = ["INSTITUTION", "ADMIN"]
MAX_BATCH = 5000


class BulkRequest(BaseModel):
    students: List[Dict[str, Any]]


def _summary(idx: int, rec: dict) -> schemas.SubmissionResultItem:
    fm = {f["field_name"]: f["value"] for f in rec["fields"]}
    issues = [v["message"] for v in rec["validations"] if v["status"] in ("FAIL", "WARNING")]
    return schemas.SubmissionResultItem(
        row=idx, apaar_id=fm.get("apaar_id"), student_name=fm.get("student_name"), record_id=rec["_id"],
        status=rec["status"], anomaly_level=rec["anomaly_level"], issues=issues,
    )


async def _run_batch(rows: List[dict], user: dict, filename: str, ftype: str, size: int) -> schemas.BulkSubmissionOut:
    if not rows:
        raise HTTPException(status_code=400, detail="No student rows found in the submission.")
    if len(rows) > MAX_BATCH:
        raise HTTPException(status_code=400, detail=f"Batch too large (max {MAX_BATCH} rows per request).")
    doc = await create_batch_document(filename, ftype, size, user)
    results = []
    for i, row in enumerate(rows, start=1):
        rec = await ingest_student(row, user, doc["_id"], source="BULK")
        results.append(_summary(i, rec))
    flagged = len([r for r in results if r.issues])
    return schemas.BulkSubmissionOut(
        submission_id=doc["_id"], total=len(results), accepted_clean=len(results) - flagged,
        flagged=flagged, results=results,
    )


@router.get("/template.csv", response_class=PlainTextResponse)
async def template_csv(user: dict = Depends(get_current_user)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(models.STUDENT_FIELDS)
    w.writerow(["123456789012", "Aarav Sharma", "21BTCS001", "14-08-2003", "Male", "1-1234567890",
                "Sample Institute of Technology", "B.Tech CSE", "Computer Science", "2025", "General",
                "120", "118", "No", "No", "No", "No", "Indian", "aarav@example.com", "9876543210", "Yes"])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv")


@router.post("", response_model=schemas.SubmissionResultItem)
async def submit_student(payload: Dict[str, Any], user: dict = Depends(require_roles(SUBMITTERS))):
    doc = await create_batch_document("single_entry.json", "application/json", len(str(payload)), user)
    rec = await ingest_student(payload, user, doc["_id"], source="FORM")
    return _summary(1, rec)


@router.post("/bulk", response_model=schemas.BulkSubmissionOut)
async def submit_bulk_json(payload: BulkRequest, user: dict = Depends(require_roles(SUBMITTERS))):
    """System-to-system integration endpoint for institutional ERP/LMS systems."""
    return await _run_batch(payload.students, user, "api_bulk.json", "application/json", len(str(payload.students)))


@router.post("/upload-csv", response_model=schemas.BulkSubmissionOut)
async def submit_csv(file: UploadFile = File(...), user: dict = Depends(require_roles(SUBMITTERS))):
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted.")
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.")
    rows = list(csv.DictReader(io.StringIO(text)))
    return await _run_batch(rows, user, file.filename or "students.csv", "text/csv", len(raw))


@router.put("/{apaar_id}", response_model=schemas.SubmissionResultItem)
async def update_student_record(apaar_id: str, payload: Dict[str, Any], institution_id: Optional[str] = None,
                                user: dict = Depends(require_roles(SUBMITTERS))):
    inst = user.get("institution_id") or institution_id
    clauses = [{"fields": {"$elemMatch": {"field_name": "apaar_id", "value": apaar_id}}}]
    if inst:
        clauses.append({"fields": {"$elemMatch": {"field_name": "institution_id", "value": inst}}})
    rec = await records_collection.find_one({"$and": clauses + [{"status": {"$ne": "REJECTED"}}]})
    if not rec:
        raise HTTPException(status_code=404, detail="No submitted record found for this APAAR ID.")
    rec = await update_student(rec, payload, user)
    return _summary(1, rec)


@verify_router.get("/{apaar_id}", response_model=schemas.ApaarVerificationOut)
async def verify_apaar(apaar_id: str, user: dict = Depends(require_roles(["ADMIN", "AICTE_OFFICER", "INSTITUTION", "EMPLOYER"]))):
    """Secure verification lookup for authorised stakeholders. Every lookup is
    written to the audit trail. Personal details are only disclosed for
    students who gave consent (or to AICTE roles)."""
    query = {"$and": [{"fields": {"$elemMatch": {"field_name": "apaar_id", "value": apaar_id}}}, scope_query(user) or {}]}
    enrolments: List[schemas.EnrolmentVerification] = []
    async for r in records_collection.find(query):
        fm = {f["field_name"]: f["value"] for f in r["fields"]}
        consent = (fm.get("consent_given") or "").lower() == "yes"
        privileged = user["role"] in ("ADMIN", "AICTE_OFFICER")
        name = fm.get("student_name") or ""
        enrolments.append(schemas.EnrolmentVerification(
            record_id=r["_id"], institution_name=fm.get("institution_name"), institution_id=fm.get("institution_id"),
            program=fm.get("program"), year_of_admission=fm.get("year_of_admission"), status=r["status"],
            anomaly_level=r["anomaly_level"] if privileged else None,
            student_name=name if (consent or privileged) else (name[:1] + "*" * max(len(name) - 1, 0)),
            student_id=fm.get("student_id") if (consent or privileged) else None,
            verified_at=r.get("verified_at"), signature_hash=r.get("signature_hash"),
        ))
    await log_audit(action="VERIFY_LOOKUP", user_id=user["_id"],
                    metadata={"apaar_id": apaar_id, "role": user["role"], "matches": len(enrolments)})
    if not enrolments:
        raise HTTPException(status_code=404, detail="No enrolment record found for this APAAR ID.")
    return schemas.ApaarVerificationOut(
        apaar_id=apaar_id, verified=any(e.status == "VERIFIED" for e in enrolments),
        enrolments=enrolments,
    )
