from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, HTTPException
from pydantic import ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from .auth import Db, Manager, CurrentUser, password_hasher, utcnow
from .models import AuthSession, User, Organization
from .request_schemas import RegisterInput, StrictModel, Profile
from .config import get_settings

router = APIRouter(prefix="/api/v1/staff", tags=["Accounts"])


class AccountInput(RegisterInput):
    role: Literal["manager", "contractor", "worker"] = "manager"
    password: str = Field(min_length=12, max_length=128)


class AccountUpdate(StrictModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=12, max_length=128)


def output(user):
    return {**Profile.model_validate(user).model_dump(), "is_active": user.is_active}


def allowed_roles(user):
    roles = {"superadmin": {"manager", "contractor", "worker"}, "manager": {"contractor"}, "contractor": {"worker"}}.get(user.role)
    if roles is None:
        raise HTTPException(403, "Нет доступа к управлению аккаунтами.")
    return roles


@router.get("/accounts")
def list_accounts(user: CurrentUser, db: Db):
    query = select(User).where(User.role.in_(allowed_roles(user)))
    if user.role == "contractor":
        query = query.where(User.contractor_id == user.id)
    return [output(row) for row in db.scalars(query.order_by(User.created_at))]


@router.post("/accounts", status_code=201)
def create_account(data: AccountInput, user: CurrentUser, db: Db):
    if data.role not in allowed_roles(user):
        raise HTTPException(403, "Создание этой роли недоступно.")
    if data.email == get_settings().superadmin_email.strip().lower():
        raise HTTPException(409, "Email зарезервирован для суперадминистратора.")
    organization_id = user.organization_id
    if data.role == "contractor":
        organization_id = str(uuid4())
        db.add(Organization(id=organization_id, name=data.company))
        db.flush()
    account = User(id=str(uuid4()), organization_id=organization_id, contractor_id=user.id if user.role == "contractor" else None,
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
def update_account(account_id: str, data: AccountUpdate, user: CurrentUser, db: Db):
    account = db.get(User, account_id)
    if not account or account.role not in allowed_roles(user) or (user.role == "contractor" and account.contractor_id != user.id):
        raise HTTPException(404, "Аккаунт недоступен. Суперадминистратор управляется через окружение сервера.")
    if data.is_active is not None:
        account.is_active = data.is_active
    if data.password is not None:
        account.password_hash = password_hasher.hash(data.password)
    if data.password is not None or data.is_active is False:
        db.execute(delete(AuthSession).where(AuthSession.user_id == account.id))
    if account.role == "contractor" and data.is_active is False:
        db.execute(delete(AuthSession).where(AuthSession.user_id.in_(select(User.id).where(User.contractor_id == account.id))))
    db.commit()
    return output(account)


@router.get("/workers")
def workers(user: CurrentUser, db: Db):
    allowed_roles(user)
    query = select(User).where(User.role == "worker", User.is_active.is_(True))
    if user.role == "contractor":
        query = query.where(User.contractor_id == user.id)
    return [output(row) for row in db.scalars(query.order_by(User.name))]
