from typing import List

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from .auth import decode_access_token
from .database import users_collection
from . import models

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user_id = payload.get("sub")
    user = await users_collection.find_one({"_id": user_id})
    if user is None:
        raise credentials_exception
    return user


def require_roles(allowed: List[str]):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user['role']}' is not permitted to perform this action.",
            )
        return user

    return checker


def scope_query(user: dict) -> dict:
    """Role-based data scoping: an institution only ever sees its own
    student records; AICTE roles (ADMIN / AICTE_OFFICER) see everything."""
    if user["role"] == "INSTITUTION" and user.get("institution_id"):
        return {"fields": {"$elemMatch": {"field_name": "institution_id", "value": user["institution_id"]}}}
    return {}
