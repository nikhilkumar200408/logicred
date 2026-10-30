from collections import Counter
import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from typing import List, Optional

from .. import schemas, models
from ..database import documents_collection, records_collection, audit_collection, users_collection, institutions_collection
from ..deps import get_current_user, require_roles, scope_query

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=schemas.DashboardStats)
async def dashboard_stats(user: dict = Depends(get_current_user)):
    sq = scope_query(user)
    records = [r async for r in records_collection.find(sq or {})]
    doc_ids = {r["document_id"] for r in records}
    documents = [d async for d in documents_collection.find({"_id": {"$in": list(doc_ids)}})]
    fields = [f for r in records for f in r["fields"]]
    validations = [v for r in records for v in r["validations"]]

    documents_processed = len([d for d in documents if d["status"] == models.DocumentStatus.PROCESSED.value])
    records_extracted = len(records)
    pending_verification = len([r for r in records if r["status"] == models.RecordStatus.PENDING_REVIEW.value])

    avg_confidence = round(sum(r["overall_confidence"] for r in records) / len(records), 1) if records else 0.0

    auto_passed = len([r for r in records if r["status"] == models.RecordStatus.AUTO_PASSED.value])
    human_reviewed = len([r for r in records if r["status"] in (
        models.RecordStatus.VERIFIED.value, models.RecordStatus.REJECTED.value, models.RecordStatus.UNRESOLVED.value
    )])
    total_r = len(records) or 1
    auto_processed_pct = round(auto_passed / total_r * 100, 1)
    human_review_pct = round(human_reviewed / total_r * 100, 1)

    validation_warnings = len([v for v in validations if v["status"] in ("WARNING", "FAIL")])

    processing_times = []
    for d in documents:
        if d.get("processed_at") and d.get("uploaded_at"):
            processing_times.append((d["processed_at"] - d["uploaded_at"]).total_seconds())
    avg_processing_time = round(sum(processing_times) / len(processing_times), 2) if processing_times else 0.0

    confidence_distribution = Counter(f["confidence_band"] for f in fields)

    validation_error_categories = Counter(
        v["rule"] for v in validations if v["status"] in ("WARNING", "FAIL")
    )

    verification_status_breakdown = Counter(r["status"] for r in records)

    institution_wise_progress = Counter(
        f["value"] for f in fields if f["field_name"] == "institution_name" and f["value"]
    )

    return schemas.DashboardStats(
        documents_processed=documents_processed,
        records_extracted=records_extracted,
        pending_verification=pending_verification,
        average_confidence=avg_confidence,
        auto_processed_pct=auto_processed_pct,
        human_review_pct=human_review_pct,
        validation_warnings=validation_warnings,
        average_processing_time_seconds=avg_processing_time,
        confidence_distribution=dict(confidence_distribution),
        validation_error_categories=dict(validation_error_categories),
        verification_status_breakdown=dict(verification_status_breakdown),
        institution_wise_progress=dict(institution_wise_progress),
        is_synthetic=True,
    )


@router.get("/officer-queue", response_model=List[schemas.OfficerQueueItem])
async def officer_queue(
    risk: Optional[str] = Query(
        "flagged", description="'flagged' (default, High/Medium risk only) or 'all'"
    ),
    user: dict = Depends(get_current_user),
):
    """AICTE Officer working queue. Defaults to High/Medium risk records
    only (anomaly_score > 30) per the risk-filtering policy — pass
    risk=all to see every record awaiting/needing verification regardless
    of anomaly score."""
    clauses: list = [{"status": {"$in": [models.RecordStatus.PENDING_REVIEW.value, models.RecordStatus.UNRESOLVED.value]}}]
    if scope_query(user):
        clauses.append(scope_query(user))
    if risk != "all":
        clauses.append({"anomaly_score": {"$gt": 30}})
    query = {"$and": clauses}
    cursor = records_collection.find(query).sort("anomaly_score", -1)
    items: List[schemas.OfficerQueueItem] = []
    async for r in cursor:
        field_map = {f["field_name"]: f["value"] for f in r["fields"]}
        items.append(schemas.OfficerQueueItem(
            record_id=r["_id"], document_id=r["document_id"],
            student_name=field_map.get("student_name"), apaar_id=field_map.get("apaar_id"),
            institution_name=field_map.get("institution_name"), program=field_map.get("program"),
            status=r["status"], overall_confidence=r["overall_confidence"],
            anomaly_level=r["anomaly_level"], anomaly_reasons=r["anomaly_reasons"],
            created_at=r["created_at"],
        ))
    return items


@router.get("/user-activity", response_model=List[schemas.UserActivityItem])
async def user_activity(user: dict = Depends(require_roles(["ADMIN"]))):
    """Per-user action counts from the audit trail — Admin-only system-wide
    user activity log."""
    users = [u async for u in users_collection.find({})]
    pipeline = [
        {"$match": {"user_id": {"$ne": None}}},
        {"$group": {"_id": "$user_id", "action_count": {"$sum": 1}, "last_action_at": {"$max": "$timestamp"}}},
    ]
    agg = {doc["_id"]: doc async for doc in audit_collection.aggregate(pipeline)}

    items: List[schemas.UserActivityItem] = []
    for u in users:
        stat = agg.get(u["_id"])
        items.append(schemas.UserActivityItem(
            user_id=u["_id"], username=u["username"], full_name=u["full_name"], role=u["role"],
            action_count=stat["action_count"] if stat else 0,
            last_action_at=stat["last_action_at"] if stat else None,
        ))
    items.sort(key=lambda i: i.action_count, reverse=True)
    return items


@router.get("/export.csv")
async def export_records_csv(
    status_filter: Optional[str] = Query(None, alias="status"),
    institution: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Bulk CSV export of student records (policy-making / accreditation /
    regulatory reports), optionally filtered by status and/or institution. Streams real data straight from MongoDB — every row is a
    genuine record, flattened field-by-field."""
    query: dict = {}
    if status_filter:
        query["status"] = status_filter
    if institution:
        query["fields"] = {"$elemMatch": {"field_name": "institution_id", "value": institution}}
    if scope_query(user):
        query = {"$and": [query, scope_query(user)]}

    columns = [
        "record_id", "document_id", "status", "overall_confidence", "anomaly_level",
        "anomaly_score", "created_at", "verified_at",
    ] + models.STUDENT_FIELDS

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(columns)

    async for r in records_collection.find(query).sort("created_at", -1):
        field_map = {f["field_name"]: f["value"] for f in r["fields"]}
        row = [
            r["_id"], r["document_id"], r["status"], r["overall_confidence"], r["anomaly_level"],
            r["anomaly_score"], r["created_at"].isoformat() if r.get("created_at") else "",
            r["verified_at"].isoformat() if r.get("verified_at") else "",
        ] + [field_map.get(f) or "" for f in models.STUDENT_FIELDS]
        writer.writerow(row)

    buffer.seek(0)
    filename = "logicred_records"
    if status_filter:
        filename += f"_{status_filter.lower()}"
    if institution:
        filename += f"_{institution.lower().replace(' ', '_')}"
    filename += ".csv"

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/admissions", response_model=schemas.AdmissionsOverview)
async def admissions_overview(
    year: Optional[str] = Query(None, description="Filter by year of admission"),
    user: dict = Depends(get_current_user),
):
    """Real-time admissions monitoring: approved intake vs actual enrolment per
    institution/program, supernumerary and NRI/OCI/FN counts, and the number
    of duplicate / invalid-APAAR / cross-institution flags."""
    sq = scope_query(user)
    groups: dict = {}
    dup = cross = invalid = total = 0
    async for r in records_collection.find(sq or {}):
        if r["status"] == "REJECTED":
            continue
        fm = {f["field_name"]: f["value"] for f in r["fields"]}
        if year and fm.get("year_of_admission") != year:
            continue
        total += 1
        rules = {v["rule"] for v in r["validations"] if v["status"] in ("FAIL", "WARNING")}
        dup += "duplicate_student_record" in rules
        cross += "cross_institution_duplicate" in rules
        invalid += bool(rules & {"invalid_apaar_id", "missing_apaar_id"})
        key = (fm.get("institution_id") or "?", fm.get("program") or "?", fm.get("year_of_admission") or "?")
        g = groups.setdefault(key, {"name": fm.get("institution_name"), "intake": None, "reg": 0, "sup": 0, "nri": 0, "oci": 0, "fn": 0})
        try:
            if fm.get("approved_intake"):
                g["intake"] = int(fm["approved_intake"])
        except ValueError:
            pass
        if fm.get("supernumerary_seat") == "Yes":
            g["sup"] += 1
        else:
            g["reg"] += 1
        g["nri"] += fm.get("nri_category") == "Yes"
        g["oci"] += fm.get("oci_status") == "Yes"
        g["fn"] += fm.get("foreign_national") == "Yes"
    # AICTE-approved intake from the institution registry takes precedence
    async for inst in institutions_collection.find({}):
        for (iid, prog, yr), g in groups.items():
            if iid == inst["_id"] and prog in (inst.get("approved_intake") or {}):
                g["intake"] = inst["approved_intake"][prog]
    rows = []
    for (iid, prog, yr), g in sorted(groups.items()):
        intake = g["intake"]
        rows.append(schemas.IntakeRow(
            institution_id=iid, institution_name=g["name"], program=prog, year_of_admission=yr,
            approved_intake=intake, regular_enrolled=g["reg"], supernumerary=g["sup"], nri=g["nri"],
            oci=g["oci"], foreign_national=g["fn"],
            utilisation_pct=round(g["reg"] / intake * 100, 1) if intake else None,
            excess=max(g["reg"] - intake, 0) if intake else 0,
        ))
    return schemas.AdmissionsOverview(
        total_students=total, institutions=len({r.institution_id for r in rows}),
        excess_programs=len([r for r in rows if r.excess > 0]), duplicate_flags=dup,
        cross_institution_flags=cross, invalid_apaar=invalid, rows=rows,
    )
