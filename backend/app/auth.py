from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
from passlib.context import CryptContext

from .config import settings

# Real password hashing (bcrypt by default, argon2 available via
# PASSWORD_HASH_SCHEME=argon2). Both schemes are always accepted on verify so
# already-hashed passwords keep working if the scheme is ever switched
# (`deprecated="auto"` transparently re-hashes on next successful login);
# whichever is listed first is used for new hashes.
_preferred_scheme = "argon2" if settings.PASSWORD_HASH_SCHEME.lower() == "argon2" else "bcrypt"
_schemes = [_preferred_scheme] + [s for s in ("bcrypt", "argon2") if s != _preferred_scheme]
pwd_context = CryptContext(schemes=_schemes, deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except (ValueError, TypeError):
        return False


def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
