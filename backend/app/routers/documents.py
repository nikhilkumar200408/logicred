import os
import re
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse

from .. import models, schemas
from ..config import settings
from ..database import documents_collection, records_collection
from ..deps import get_current_user, require_roles
from ..services.audit.service import log_audit
from ..services.pipeline import process_document, ProcessingError

router = APIRouter(prefix="/api/documents", tags=["documents"])

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


def _sanitize_filename(name: str) -> str:
    name = os.path.basename(name)
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name[-150:] or "upload"


def _document_out(document: dict) -> schemas.DocumentOut:
    return schemas.DocumentOut(
        id=document["_id"], filename=document["filename"], file_type=document["file_type"],
        file_size_bytes=document["file_size_bytes"], status=document["status"],
        uploaded_at=document["uploaded_at"],
        processed_at=document.get("processed_at"), error_message=document.get("error_message"),
    )


def _record_out(r: dict) -> schemas.StudentRecordOut:
    return schemas.StudentRecordOut(
        id=r["_id"], document_id=r["document_id"], status=r["status"],
        overall_confidence=r["overall_confidence"], anomaly_score=r["anomaly_score"],
        anomaly_level=r["anomaly_level"], anomaly_reasons=r["anomaly_reasons"],
        created_at=r["created_at"], verified_at=r.get("verified_at"), verified_by=r.get("verified_by"),
    )


async def _save_one(file: UploadFile, user: dict) -> dict:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}' ({file.filename}). Allowed: {settings.ALLOWED_EXTENSIONS}",
        )
    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{file.filename}' exceeds max size of {settings.MAX_UPLOAD_SIZE_MB}MB",
        )
    safe_name = _sanitize_filename(file.filename or "upload")
    stored_name = f"{uuid.uuid4()}_{safe_name}"
    stored_path = os.path.join(settings.UPLOAD_DIR, stored_name)
    with open(stored_path, "wb") as f:
        f.write(contents)

    document = {
        "_id": models.gen_uuid(),
        "filename": safe_name,
        "stored_path": stored_path,
        "file_type": file.content_type or ext,
        "file_size_bytes": len(contents),
        "status": models.DocumentStatus.UPLOADED.value,
        "uploaded_by": user["_id"],
        "uploaded_at": models.utcnow(),
        "processed_at": None,
        "error_message": None,
    }
    await documents_collection.insert_one(document)
    await log_audit(action="UPLOAD", document_id=document["_id"], user_id=user["_id"],
                     metadata={"filename": document["filename"]})
    return document


@router.post("/upload", response_model=schemas.DocumentOut)
async def upload_document(
    file: UploadFile = File(...),
    user: dict = Depends(require_roles(["INSTITUTION", "ADMIN"])),
):
    document = await _save_one(file, user)
    return _document_out(document)


@router.post("/upload-batch", response_model=List[schemas.DocumentOut])
async def upload_documents_batch(
    files: List[UploadFile] = File(...),
    user: dict = Depends(require_roles(["INSTITUTION", "ADMIN"])),
):
    """Drag-and-drop batch upload: accepts multiple .pdf/.jpg/.jpeg/.png
    files in one request. Each file is saved and registered independently —
    one bad file in the batch doesn't block the others."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    documents = []
    errors = []
    for file in files:
        try:
            documents.append(await _save_one(file, user))
        except HTTPException as e:
            errors.append(f"{file.filename}: {e.detail}")

    if not documents and errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    return [_document_out(d) for d in documents]


@router.post("/{document_id}/process", response_model=schemas.StudentRecordOut)
async def process(document_id: str, user: dict = Depends(require_roles(["INSTITUTION", "ADMIN"]))):
    document = await documents_collection.find_one({"_id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    existing_record = await records_collection.find_one({"document_id": document_id})
    if existing_record is not None:
        return _record_out(existing_record)
    try:
        record = await process_document(document, user)
    except ProcessingError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")
    return _record_out(record)


@router.get("", response_model=List[schemas.DocumentOut])
async def list_documents(user: dict = Depends(get_current_user)):
    cursor = documents_collection.find({}).sort("uploaded_at", -1)
    return [_document_out(d) async for d in cursor]


@router.get("/{document_id}", response_model=schemas.DocumentDetailOut)
async def get_document(document_id: str, user: dict = Depends(get_current_user)):
    document = await documents_collection.find_one({"_id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    record = await records_collection.find_one({"document_id": document_id})
    base = _document_out(document)
    return schemas.DocumentDetailOut(**base.model_dump(), student_record_id=record["_id"] if record else None)


@router.get("/{document_id}/file")
async def get_document_file(document_id: str, user: dict = Depends(get_current_user)):
    """Serves the original uploaded scan/PDF so the frontend can render the
    real high-resolution document viewer (with pan/zoom + OCR bbox overlay)
    instead of a stand-in illustration."""
    document = await documents_collection.find_one({"_id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    stored_path = document.get("stored_path")
    if not stored_path or not os.path.exists(stored_path):
        raise HTTPException(status_code=404, detail="Original file is not available on this server")
    return FileResponse(stored_path, media_type=document.get("file_type") or "application/octet-stream")
