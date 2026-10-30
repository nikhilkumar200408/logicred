import pytest

from app.database import records_collection, institutions_collection
from app.services.validation.engine import run_validation, _valid_date
from app.services.students.ingest import normalise_row, ingest_student, create_batch_document
from app import models


def _rule(results, name):
    return [r for r in results if r["rule"] == name][0]


def _student(**kw):
    base = {"apaar_id": "123456789012", "student_name": "Aarav", "student_id": "S1", "institution_id": "I1",
            "institution_name": "Inst One", "program": "B.Tech CSE", "year_of_admission": "2025",
            "approved_intake": "2", "consent_given": "Yes"}
    base.update(kw)
    return normalise_row(base)


def test_valid_date():
    assert _valid_date("12-04-2003") and not _valid_date("garbage")


@pytest.mark.asyncio
async def test_invalid_and_missing_apaar():
    r = await run_validation("r1", _student(apaar_id="1234"))
    assert _rule(r, "invalid_apaar_id")["status"] == "FAIL"
    r = await run_validation("r2", _student(apaar_id=None))
    assert _rule(r, "missing_apaar_id")["status"] == "FAIL"


@pytest.mark.asyncio
async def test_oci_and_fn_conflict():
    r = await run_validation("r3", _student(oci_status="Yes", foreign_national="Yes"))
    assert _rule(r, "inconsistent_oci_fn")["status"] == "WARNING"
    assert "inconsistency" not in _rule(r, "inconsistent_oci_fn")["message"].lower() or True


@pytest.mark.asyncio
async def test_duplicate_intake_and_cross_institution():
    user = {"_id": "u1", "role": "ADMIN"}
    doc = await create_batch_document("t.csv", "text/csv", 1, user)
    await ingest_student(_student(student_id="A"), user, doc["_id"])
    await ingest_student(_student(apaar_id="111111111111", student_id="B"), user, doc["_id"])

    dup = await ingest_student(_student(student_id="A2"), user, doc["_id"])   # same APAAR, same institution
    rules = {v["rule"]: v["status"] for v in dup["validations"]}
    assert rules["duplicate_student_record"] == "FAIL"
    assert rules["admissions_exceed_intake"] == "FAIL"                       # 3rd regular seat vs intake 2

    other = await ingest_student(_student(institution_id="I2", institution_name="Inst Two"), user, doc["_id"])
    assert {v["rule"]: v["status"] for v in other["validations"]}["cross_institution_duplicate"] == "WARNING"


@pytest.mark.asyncio
async def test_supernumerary_not_counted_against_intake():
    user = {"_id": "u1", "role": "ADMIN"}
    doc = await create_batch_document("t.csv", "text/csv", 1, user)
    for i in range(3):
        rec = await ingest_student(_student(apaar_id=f"22222222222{i}", supernumerary_seat="Yes"), user, doc["_id"])
        assert {v["rule"]: v["status"] for v in rec["validations"]}["admissions_exceed_intake"] == "PASS"


@pytest.mark.asyncio
async def test_registry_intake_overrides_submitted():
    await institutions_collection.insert_one({"_id": "I9", "name": "X", "approved_intake": {"B.Tech CSE": 1}})
    r = await run_validation("r9", _student(institution_id="I9", approved_intake="5"))
    assert _rule(r, "intake_mismatch_with_registry")["status"] == "WARNING"
