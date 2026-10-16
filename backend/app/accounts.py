from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, HTTPException
from pydantic import ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from .auth import Db, Manager, Superadmin, password_hasher, utcnow
from .models import AuthSession, User
from .request_schemas import RegisterInput, StrictModel, Profile
from .config import get_settings

router = APIRouter(prefix="/api/v1/staff", tags=["Accounts"])


class AccountInput(RegisterInput):
    role: Literal["manager", "worker"] = "manager"
    password: str = Field(min_length=12, max_length=128)


class AccountUpdate(StrictModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=12, max_length=128)


def output(user):
    return {**Profile.model_validate(user).model_dump(), "is_active": user.is_active}


@router.get("/accounts")
def list_accounts(user: Superadmin, db: Db):
    return [output(row) for row in db.scalars(select(User).where(User.role.in_(["superadmin", "manager", "worker"])).order_by(User.created_at))]


@router.post("/accounts", status_code=201)
def create_account(data: AccountInput, user: Superadmin, db: Db):
    if data.email == get_settings().superadmin_email.strip().lower():
        raise HTTPException(409, "Email зарезервирован для суперадминистратора.")
    account = User(id=str(uuid4()), organization_id=user.organization_id,
        **data.model_dump(exclude={"password"}), password_hash=password_hasher.hash(data.password),
        is_active=True, created_at=utcnow())
    db.add(account)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Аккаунт с таким email уже существует.")
    return output(account)


@router.patch("/accounts/{account_id}")
def update_account(account_id: str, data: AccountUpdate, user: Superadmin, db: Db):
    account = db.get(User, account_id)
    if not account or account.role not in {"manager", "worker"}:
        raise HTTPException(404, "Аккаунт недоступен. Суперадминистратор управляется через окружение сервера.")
    if data.is_active is not None:
        account.is_active = data.is_active
    if data.password is not None:
        account.password_hash = password_hasher.hash(data.password)
    if data.password is not None or data.is_active is False:
        db.execute(delete(AuthSession).where(AuthSession.user_id == account.id))
    db.commit()
    return output(account)


@router.get("/workers")
def workers(user: Manager, db: Db):
    return [output(row) for row in db.scalars(select(User).where(User.role == "worker", User.is_active.is_(True)).order_by(User.name))]
