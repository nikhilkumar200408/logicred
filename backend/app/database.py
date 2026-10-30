"""
MongoDB connection (Motor async client) for LogicRed.

Replaces the previous SQLAlchemy/SQLite setup. A single AsyncIOMotorClient is
created at import time and reused for the life of the process; FastAPI's
startup/shutdown hooks (see main.py) verify connectivity and build indexes.
"""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import settings

client: AsyncIOMotorClient = AsyncIOMotorClient(settings.MONGODB_URL)
db: AsyncIOMotorDatabase = client[settings.MONGODB_DB_NAME]

# Collections (records, documents/submissions, audit, users, institutions)
users_collection = db["users"]
documents_collection = db["documents"]
records_collection = db["records"]
audit_collection = db["audit"]
institutions_collection = db["institutions"]


def get_db() -> AsyncIOMotorDatabase:
    """FastAPI dependency — returns the shared Motor database handle."""
    return db


async def create_indexes() -> None:
    """Called once on app startup. Safe to call repeatedly (idempotent)."""
    await users_collection.create_index("username", unique=True)
    await documents_collection.create_index("uploaded_at")
    await records_collection.create_index("status")
    await records_collection.create_index("created_at")
    await records_collection.create_index("document_id")
    await records_collection.create_index("fields.field_name")
    await records_collection.create_index("fields.value")
    await records_collection.create_index([("fields.field_name", 1), ("fields.value", 1)])
    await audit_collection.create_index("timestamp")
    await audit_collection.create_index("record_id")
    await audit_collection.create_index("document_id")


async def ping() -> bool:
    await client.admin.command("ping")
    return True
