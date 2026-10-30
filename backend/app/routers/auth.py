from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from .. import schemas
from ..auth import verify_password, create_access_token, hash_password
from ..database import users_collection
from ..deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _to_user_out(user: dict) -> schemas.UserOut:
    return schemas.UserOut(id=user["_id"], username=user["username"], full_name=user["full_name"], role=user["role"],
                           institution_id=user.get("institution_id"), institution_name=user.get("institution_name"))


@router.post("/register", response_model=schemas.TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: schemas.RegisterRequest):
    # Never allow public users to grant themselves privileged regulatory roles.
    if payload.role not in ("INSTITUTION", "EMPLOYER"):
        raise HTTPException(status_code=400, detail="This role cannot be self-registered.")
    username = payload.username.strip().lower()
    if await users_collection.find_one({"username": username}):
        raise HTTPException(status_code=409, detail="Username is already registered.")
    if payload.role == "INSTITUTION" and (not payload.institution_id or not payload.institution_name):
        raise HTTPException(status_code=400, detail="Institution ID and institution name are required for this role.")
    user = {
        "_id": str(uuid4()),
        "username": username,
        "full_name": payload.full_name.strip(),
        "hashed_password": hash_password(payload.password),
        "role": payload.role,
        "institution_id": payload.institution_id.strip() if payload.institution_id else None,
        "institution_name": payload.institution_name.strip() if payload.institution_name else None,
    }
    await users_collection.insert_one(user)
    token = create_access_token({"sub": user["_id"], "role": user["role"]})
    return schemas.TokenResponse(access_token=token, user=_to_user_out(user))


@router.post("/login", response_model=schemas.TokenResponse)
async def login(payload: schemas.LoginRequest):
    user = await users_collection.find_one({"username": payload.username})
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = create_access_token({"sub": user["_id"], "role": user["role"]})
    return schemas.TokenResponse(access_token=token, user=_to_user_out(user))


@router.get("/me", response_model=schemas.UserOut)
async def me(user: dict = Depends(get_current_user)):
    return _to_user_out(user)
