"""
Seeds demo users, the AICTE institution registry and a sample student CSV
(backend/sample_data/students_sample.csv) through the REAL ingestion +
validation pipeline. The sample file deliberately contains an intake overflow,
an invalid APAAR ID, a cross-institution duplicate, an OCI+FN conflict and a
missing-consent row so every validation rule is visible on the dashboard.

Run with: python -m app.seed_real_data
"""
import asyncio
import csv
import os

from . import models
from .auth import hash_password
from .database import users_collection, institutions_collection, records_collection, create_indexes
from .services.students.ingest import ingest_student, create_batch_document

SAMPLE_CSV = os.path.join(os.path.dirname(__file__), "..", "sample_data", "students_sample.csv")

INSTITUTIONS = [
    {"_id": "1-1000000001", "name": "Sample Institute of Technology", "state": "Madhya Pradesh",
     "approved_intake": {"B.Tech CSE": 2}},     # tiny intake so the demo shows an overflow
    {"_id": "1-1000000002", "name": "Demo College of Engineering", "state": "Karnataka",
     "approved_intake": {"B.Tech ME": 60}},
]

USERS = [
    {"username": "admin", "full_name": "AICTE Administrator", "password": "Admin@123", "role": models.UserRole.ADMIN},
    {"username": "aicte_officer", "full_name": "AICTE Verification Officer", "password": "Officer@123",
     "role": models.UserRole.AICTE_OFFICER},
    {"username": "institution1", "full_name": "Sample Institute Admissions Cell", "password": "Institution@123",
     "role": models.UserRole.INSTITUTION, "institution_id": "1-1000000001",
     "institution_name": "Sample Institute of Technology"},
    {"username": "institution2", "full_name": "Demo College Admissions Cell", "password": "Institution@123",
     "role": models.UserRole.INSTITUTION, "institution_id": "1-1000000002",
     "institution_name": "Demo College of Engineering"},
    {"username": "employer", "full_name": "Demo Employer (HR)", "password": "Employer@123",
     "role": models.UserRole.EMPLOYER},
]


async def seed():
    await create_indexes()
    for inst in INSTITUTIONS:
        if not await institutions_collection.find_one({"_id": inst["_id"]}):
            await institutions_collection.insert_one(inst)

    created = {}
    for u in USERS:
        existing = await users_collection.find_one({"username": u["username"]})
        if existing:
            created[u["username"]] = existing
            continue
        doc = {"_id": models.gen_uuid(), "username": u["username"], "full_name": u["full_name"],
               "hashed_password": hash_password(u["password"]), "role": u["role"].value,
               "created_at": models.utcnow(),
               "institution_id": u.get("institution_id"), "institution_name": u.get("institution_name")}
        await users_collection.insert_one(doc)
        created[u["username"]] = doc
        print(f"Created user: {u['username']} / {u['password']} ({u['role'].value})")

    if await records_collection.count_documents({}) > 0:
        print("Records already exist — skipping sample ingestion.")
        return

    with open(SAMPLE_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    # Each row is submitted by the institution that owns it (RBAC-scoped).
    by_inst = {}
    for row in rows:
        by_inst.setdefault(row["institution_id"], []).append(row)
    for inst_id, inst_rows in by_inst.items():
        user = next(u for u in created.values() if u.get("institution_id") == inst_id)
        doc = await create_batch_document("students_sample.csv", "text/csv", 0, user)
        for row in inst_rows:
            rec = await ingest_student(row, user, doc["_id"], source="BULK")
            print(f"  -> {row['apaar_id']} {row['student_name']}: status={rec['status']} anomaly={rec['anomaly_level']}")
    print("Seeding complete. All records went through the real validation pipeline.")


if __name__ == "__main__":
    asyncio.run(seed())
