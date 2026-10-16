from datetime import datetime, timedelta, timezone
from hashlib import sha256
import secrets
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .config import get_settings
from .models import AuthAttempt, AuthSession, Organization, User
from .request_schemas import LoginInput, Profile, RegisterInput, SessionOutput

router = APIRouter(prefix="/api/v1/auth", tags=["Account"])
password_hasher = PasswordHash.recommended()
dummy_hash = password_hasher.hash(secrets.token_urlsafe(24))
bearer = HTTPBearer(auto_error=False)
Db = Annotated[Session, Depends(get_db)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def utcnow():
    return datetime.now(timezone.utc)


def digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


def current_user(db: Db, credentials: Credentials) -> User:
    token_hash = digest(credentials.credentials) if credentials else ""
    user = db.scalar(select(User).join(AuthSession, AuthSession.user_id == User.id).where(
        AuthSession.token_hash == token_hash, AuthSession.expires_at > utcnow(), User.is_active.is_(True)))
    if user and user.contractor_id:
        parent = db.get(User, user.contractor_id)
        if not parent or not parent.is_active:
            user = None
    if not user:
        raise HTTPException(401, "Войдите в аккаунт, чтобы отправить заявку.", headers={"WWW-Authenticate": "Bearer"})
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def manager_user(user: CurrentUser):
    if user.role not in {"manager", "superadmin"}:
        raise HTTPException(403, "Доступ только для сотрудников IC Group.")
    return user


Manager = Annotated[User, Depends(manager_user)]


def superadmin_user(user: CurrentUser):
    if user.role != "superadmin":
        raise HTTPException(403, "Управление администраторами доступно только суперадминистратору.")
    return user


Superadmin = Annotated[User, Depends(superadmin_user)]


def throttle(db: Session, request: Request, email: str):
    now = utcnow()
    cutoff = now - timedelta(minutes=15)
    db.execute(delete(AuthAttempt).where(AuthAttempt.created_at < cutoff))
    # Never trust caller-supplied forwarding headers. Both limits persist across restarts.
    for scope, limit in ((f"email:{email}", 12), (f"ip:{request.client.host if request.client else 'unknown'}", 100)):
        key = digest(scope)
        count = db.scalar(select(func.count()).select_from(AuthAttempt).where(AuthAttempt.scope_hash == key))
        if count >= limit:
            db.rollback()
            raise HTTPException(429, "Слишком много попыток. Попробуйте через 15 минут.", headers={"Retry-After": "900"})
        db.add(AuthAttempt(id=str(uuid4()), scope_hash=key, created_at=now))
    db.commit()


def make_session(db: Session, user: User, response: Response):
    token = secrets.token_urlsafe(32)
    expires = utcnow() + timedelta(hours=12)
    db.execute(delete(AuthSession).where(AuthSession.expires_at < utcnow()))
    db.add(AuthSession(token_hash=digest(token), user_id=user.id, expires_at=expires))
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return SessionOutput(access_token=token, expires_at=expires, user=Profile.model_validate(user))


@router.post("/register", response_model=SessionOutput, status_code=201)
def register(data: RegisterInput, request: Request, response: Response, db: Db):
    throttle(db, request, data.email)
    if data.email == get_settings().superadmin_email.strip().lower() or db.scalar(select(User.id).where(User.email == data.email)):
        raise HTTPException(409, "Не удалось зарегистрироваться с этим email. Попробуйте войти.")
    organization_id = str(uuid4())
    # Company names are descriptions, never proof of membership in an existing tenant.
    db.add(Organization(id=organization_id, name=data.company))
    db.flush()
    user = User(id=str(uuid4()), organization_id=organization_id, email=data.email,
        password_hash=password_hasher.hash(data.password), name=data.name, phone=data.phone,
        company=data.company, role="client", created_at=utcnow())
    db.add(user)
    try:
        db.flush()
        return make_session(db, user, response)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Не удалось зарегистрироваться с этим email. Попробуйте войти.")


@router.post("/login", response_model=SessionOutput)
def login(data: LoginInput, request: Request, response: Response, db: Db):
    throttle(db, request, data.email)
    user = db.scalar(select(User).where(User.email == data.email))
    valid = password_hasher.verify(data.password, user.password_hash if user else dummy_hash)
    if user and user.contractor_id:
        parent = db.get(User, user.contractor_id)
        if not parent or not parent.is_active:
            user = None
    if not user or not valid or not user.is_active:
        raise HTTPException(401, "Неверный email или пароль.")
    return make_session(db, user, response)


@router.get("/me", response_model=Profile)
def me(user: CurrentUser, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return user


@router.post("/logout", status_code=204)
def logout(user: CurrentUser, credentials: Credentials, db: Db):
    db.execute(delete(AuthSession).where(AuthSession.token_hash == digest(credentials.credentials)))
    db.commit()
    return Response(status_code=204)
