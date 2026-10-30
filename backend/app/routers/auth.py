from fastapi import APIRouter, Depends, HTTPException, status

from .. import schemas
from ..auth import verify_password, create_access_token
from ..database import users_collection
from ..deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _to_user_out(user: dict) -> schemas.UserOut:
    return schemas.UserOut(id=user["_id"], username=user["username"], full_name=user["full_name"], role=user["role"],
                           institution_id=user.get("institution_id"), institution_name=user.get("institution_name"))


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
