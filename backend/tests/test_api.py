import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import users_collection, institutions_collection
from app import models
from app.auth import hash_password

CSV = (
    "apaar_id,student_name,student_id,institution_id,institution_name,program,year_of_admission,approved_intake,consent_given\n"
    "123456789012,Aarav,S1,1-1,Inst One,B.Tech CSE,2025,1,Yes\n"
    "123456789013,Diya,S2,1-1,Inst One,B.Tech CSE,2025,1,Yes\n"
    "bad,Rohit,S3,1-1,Inst One,B.Tech CSE,2025,1,Yes\n"
)


@pytest_asyncio.fixture(autouse=True)
async def _seed():
    await institutions_collection.insert_one({"_id": "1-1", "name": "Inst One", "approved_intake": {"B.Tech CSE": 1}})
    for u, role, inst in [("inst", models.UserRole.INSTITUTION, "1-1"), ("inst2", models.UserRole.INSTITUTION, "9-9"),
                          ("officer", models.UserRole.AICTE_OFFICER, None), ("emp", models.UserRole.EMPLOYER, None)]:
        await users_collection.insert_one({"_id": models.gen_uuid(), "username": u, "full_name": u,
                                           "hashed_password": hash_password("pw"), "role": role.value,
                                           "institution_id": inst, "institution_name": "Inst One" if inst else None,
                                           "created_at": models.utcnow()})


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def hdr(client, user):
    r = await client.post("/api/auth/login", json={"username": user, "password": "pw"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_csv_upload_flags_issues_and_rbac(client):
    h = await hdr(client, "inst")
    r = await client.post("/api/students/upload-csv", files={"file": ("s.csv", CSV, "text/csv")}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3 and body["flagged"] == 2
    assert "Admissions exceed approved intake" in " ".join(body["results"][1]["issues"])
    assert any("invalid" in i.lower() for i in body["results"][2]["issues"])

    # other institution cannot see these records; employer cannot submit
    assert (await client.get("/api/records", headers=await hdr(client, "inst2"))).json() == []
    assert len((await client.get("/api/records", headers=await hdr(client, "officer"))).json()) == 3
    r = await client.post("/api/students/upload-csv", files={"file": ("s.csv", CSV, "text/csv")}, headers=await hdr(client, "emp"))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_verify_lookup_and_admissions_overview(client):
    h = await hdr(client, "inst")
    await client.post("/api/students/upload-csv", files={"file": ("s.csv", CSV, "text/csv")}, headers=h)
    r = await client.get("/api/verify/123456789012", headers=await hdr(client, "emp"))
    assert r.status_code == 200 and r.json()["enrolments"][0]["institution_name"] == "Inst One"
    assert (await client.get("/api/verify/000000000000", headers=await hdr(client, "emp"))).status_code == 404
    ov = (await client.get("/api/dashboard/admissions", headers=await hdr(client, "officer"))).json()
    assert ov["excess_programs"] == 1 and ov["invalid_apaar"] == 1


@pytest.mark.asyncio
async def test_update_and_stats(client):
    h = await hdr(client, "inst")
    await client.post("/api/students/upload-csv", files={"file": ("s.csv", CSV, "text/csv")}, headers=h)
    r = await client.put("/api/students/123456789013", json={"student_name": "Diya K"}, headers=h)
    assert r.status_code == 200
    s = await client.get("/api/dashboard/stats", headers=await hdr(client, "officer"))
    assert s.status_code == 200 and s.json()["records_extracted"] == 3
    q = await client.get("/api/dashboard/officer-queue?risk=all", headers=await hdr(client, "officer"))
    assert q.status_code == 200 and len(q.json()) >= 2
    e = await client.get("/api/dashboard/export.csv", headers=await hdr(client, "officer"))
    assert "apaar_id" in e.text
