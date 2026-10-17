from datetime import date, timedelta, timezone
from hashlib import sha256
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .auth import CurrentUser, Db, utcnow
from .coins_models import BonusRequest, CoinTransaction
from .models import User
from .request_schemas import StrictModel

router = APIRouter(prefix="/api/v1/coins", tags=["IC-coins"])
WAYS = {"arrival": 50, "cleaning": 100, "training": 100, "extra": None}
WAY_LABELS = {"arrival": "Пришёл вовремя", "cleaning": "Качественная уборка в срок", "training": "Обучение по технике уборки", "extra": "Дополнительное задание"}
PRODUCTS = [
    dict(id="juice", title="Сок", cost=300, description="Небольшая награда после смены", category="Напитки"),
    dict(id="snack", title="Кофе и перекус", cost=500, description="Купон номиналом 1 000 ₸", category="Купон"),
    dict(id="phone", title="Мобильная связь", cost=1000, description="Пополнение на 2 000 ₸", category="Связь"),
    dict(id="lunch", title="Обед", cost=1500, description="Купон номиналом 3 000 ₸", category="Купон"),
    dict(id="home", title="Товары для дома", cost=2000, description="Сертификат на 4 000 ₸", category="Сертификат"),
    dict(id="groceries-small", title="Продукты на каждый день", cost=2500, description="Сертификат на 5 000 ₸", category="Сертификат"),
    dict(id="clothes-small", title="Одежда и обувь", cost=3500, description="Сертификат на 7 000 ₸", category="Сертификат"),
    dict(id="groceries", title="Большая продуктовая покупка", cost=5000, description="Сертификат на 10 000 ₸", category="Сертификат"),
    dict(id="clothes", title="Обновление гардероба", cost=6000, description="Сертификат на 12 000 ₸", category="Сертификат"),
]


class BonusInput(StrictModel):
    way: Literal["arrival", "cleaning", "training", "extra"]
    date: date
    reference: str = Field(min_length=1, max_length=180)
    note: str = Field(default="", max_length=500)

    @field_validator("date")
    @classmethod
    def completed_date(cls, value):
        if value > utcnow().astimezone(timezone(timedelta(hours=5))).date():
            raise ValueError("Работа ещё не выполнена")
        return value


class ReviewInput(StrictModel):
    decision: Literal["approved", "rejected"]
    amount: int | None = Field(default=None, ge=50, le=150, strict=True)
    note: str = Field(default="", max_length=500)


class PurchaseInput(StrictModel):
    product_id: str = Field(min_length=1, max_length=50)
    idempotency_key: str = Field(min_length=16, max_length=80)


def require_role(user, role):
    if user.role != role:
        raise HTTPException(403, "Этот раздел недоступен для вашей роли.")


def balance(db, worker_id):
    return db.scalar(select(func.coalesce(func.sum(CoinTransaction.amount), 0)).where(CoinTransaction.worker_id == worker_id))


def lock_worker(db, worker_id):
    # Every balance-changing path locks the same account before reading its balance.
    # PostgreSQL serializes approvals and purchases, including distinct requests.
    return db.scalar(select(User).where(User.id == worker_id).with_for_update().execution_options(populate_existing=True))


def grant_welcome(db, worker_id):
    # Called only within the account creation transaction; never on login or GET.
    db.add(CoinTransaction(id=str(uuid4()), worker_id=worker_id, event_key="welcome", kind="welcome",
        amount=1000, description="Стартовые IC-coins при создании аккаунта", created_at=utcnow()))


def request_output(row, worker_name=None):
    return {"id": row.id, "worker_id": row.worker_id, "worker_name": worker_name,
        "way": row.way, "date": row.date, "reference": row.reference, "note": row.note,
        "status": row.status, "amount": row.amount, "decision_note": row.decision_note,
        "created_at": row.created_at, "reviewed_at": row.reviewed_at}


def transaction_output(row):
    return {"id": row.id, "kind": row.kind, "amount": row.amount, "description": row.description,
        "created_at": row.created_at, "product_id": row.product_id,
        "status": "awaiting_fulfillment" if row.kind == "purchase" else "credited"}


@router.get("/wallet")
def wallet(user: CurrentUser, db: Db):
    require_role(user, "worker")
    parent = db.get(User, user.contractor_id) if user.contractor_id else None
    requests = list(db.scalars(select(BonusRequest).where(BonusRequest.worker_id == user.id).order_by(BonusRequest.created_at.desc()).limit(100)))
    transactions = list(db.scalars(select(CoinTransaction).where(CoinTransaction.worker_id == user.id).order_by(CoinTransaction.created_at.desc()).limit(100)))
    sums = dict(db.execute(select(CoinTransaction.kind, func.sum(CoinTransaction.amount)).where(CoinTransaction.worker_id == user.id).group_by(CoinTransaction.kind)).all())
    pending = db.scalar(select(func.count()).select_from(BonusRequest).where(BonusRequest.worker_id == user.id, BonusRequest.status == "pending"))
    return {"balance": sum(sums.values()), "welcome": sums.get("welcome", 0), "earned": sums.get("bonus", 0),
        "spent": -sums.get("purchase", 0), "pending": pending, "rate": 2,
        "contractor_name": parent.name if parent else None,
        "can_request": bool(parent and parent.role == "contractor" and parent.is_active),
        "requests": [request_output(r) for r in requests], "transactions": [transaction_output(t) for t in transactions], "products": PRODUCTS}


@router.post("/requests", status_code=201)
def submit(data: BonusInput, user: CurrentUser, db: Db):
    require_role(user, "worker")
    worker = lock_worker(db, user.id)
    parent = db.get(User, worker.contractor_id) if worker.contractor_id else None
    if not parent or parent.role != "contractor" or not parent.is_active:
        raise HTTPException(409, "У аккаунта нет активного субподрядчика, который может подтвердить бонусы.")
    canonical = " ".join(data.reference.split()).casefold()
    key = sha256(f"{data.way}|{'' if data.way == 'training' else data.date.isoformat()}|{canonical}".encode()).hexdigest()
    if db.scalar(select(BonusRequest.id).where(BonusRequest.worker_id == user.id, BonusRequest.dedup_key == key, BonusRequest.status.in_(["pending", "approved"]))):
        raise HTTPException(409, "Запрос за эту работу уже есть в истории.")
    row = BonusRequest(id=str(uuid4()), worker_id=user.id, contractor_id=parent.id, dedup_key=key,
        **data.model_dump(), amount=WAYS[data.way], status="pending", decision_note="", created_at=utcnow())
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Запрос за эту работу уже есть в истории.")
    return request_output(row)


@router.get("/review")
def review_queue(user: CurrentUser, db: Db, status: Literal["pending", "approved", "rejected", "all"] = "pending", offset: int = Query(default=0, ge=0)):
    require_role(user, "contractor")
    query = select(BonusRequest, User.name).join(User, User.id == BonusRequest.worker_id).where(
        BonusRequest.contractor_id == user.id, User.contractor_id == user.id, User.role == "worker")
    if status != "all":
        query = query.where(BonusRequest.status == status)
    rows = db.execute(query.order_by(BonusRequest.created_at.desc(), BonusRequest.id).offset(offset).limit(51)).all()
    return {"requests": [request_output(r, name) for r, name in rows[:50]], "more": len(rows) > 50}


@router.post("/requests/{request_id}/review")
def review(request_id: str, data: ReviewInput, user: CurrentUser, db: Db):
    require_role(user, "contractor")
    row = db.get(BonusRequest, request_id)
    if not row or row.contractor_id != user.id:
        raise HTTPException(404, "Запрос не найден.")
    worker = lock_worker(db, row.worker_id)
    if not worker or worker.role != "worker" or worker.contractor_id != user.id:
        raise HTTPException(404, "Запрос не найден.")
    db.refresh(row)
    if row.status != "pending":
        if row.status == data.decision:
            return request_output(row, worker.name)  # Retry must never credit twice.
        raise HTTPException(409, "Решение по запросу уже принято.")
    if not worker.is_active:
        raise HTTPException(409, "Аккаунт работника отключён.")
    if data.decision == "rejected":
        if not data.note:
            raise HTTPException(422, "Укажите причину отказа.")
        if data.amount is not None:
            raise HTTPException(422, "При отказе сумма не указывается.")
    else:
        amount = WAYS[row.way]
        if row.way == "extra":
            if data.amount is None:
                raise HTTPException(422, "Укажите от 50 до 150 IC-coins за дополнительное задание.")
            amount = data.amount
        elif data.amount is not None and data.amount != amount:
            raise HTTPException(422, "Для этого способа сумма фиксирована.")
        row.amount = amount
        db.add(CoinTransaction(id=str(uuid4()), worker_id=worker.id, event_key=f"bonus:{row.id}",
            request_id=row.id, kind="bonus", amount=amount, description=WAY_LABELS[row.way], created_at=utcnow()))
    row.status = data.decision
    row.decision_note = data.note
    row.reviewed_at = utcnow()
    db.commit()
    return request_output(row, worker.name)


@router.post("/purchases", status_code=201)
def purchase(data: PurchaseInput, user: CurrentUser, db: Db):
    require_role(user, "worker")
    lock_worker(db, user.id)
    key = f"purchase:{data.idempotency_key}"
    existing = db.scalar(select(CoinTransaction).where(CoinTransaction.worker_id == user.id, CoinTransaction.event_key == key))
    if existing:
        if existing.product_id != data.product_id:
            raise HTTPException(409, "Этот ключ уже использован для другой покупки.")
        return transaction_output(existing)
    product = next((p for p in PRODUCTS if p["id"] == data.product_id), None)
    if not product:
        raise HTTPException(404, "Награда не найдена.")
    if balance(db, user.id) < product["cost"]:
        raise HTTPException(409, "Недостаточно IC-coins для этой награды.")
    row = CoinTransaction(id=str(uuid4()), worker_id=user.id, event_key=key, kind="purchase", amount=-product["cost"],
        description=product["title"], product_id=product["id"], created_at=utcnow())
    db.add(row)
    db.commit()
    return transaction_output(row)
