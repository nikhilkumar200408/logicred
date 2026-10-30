"""
Database adapter for LogicRed.

When DEMO_MODE=true and no external database is configured, use an in-memory
Mongo-compatible mock. This keeps the API runnable for demos without MongoDB.
Data is temporary and may reset when a serverless instance restarts.
"""
from .config import settings

if settings.DEMO_MODE:
    from mongomock_motor import AsyncMongoMockClient

    client = AsyncMongoMockClient()
else:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(settings.MONGODB_URL)

db = client[settings.MONGODB_DB_NAME]

users_collection = db["users"]
documents_collection = db["documents"]
records_collection = db["records"]
audit_collection = db["audit"]
institutions_collection = db["institutions"]


def get_db():
    return db


async def create_indexes() -> None:
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
    if settings.DEMO_MODE:
        await client.admin.command("ping")
    else:
        await client.admin.command("ping")
    return True
