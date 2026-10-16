from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .auth import CurrentUser, Db, Manager, utcnow
from .models import ServiceRequest
from .request_schemas import CreateRequest, Profile, RequestOutput, StatusInput

router = APIRouter(prefix="/api/v1", tags=["Service requests"])


def existing_request(db, user_id, key):
    return db.scalar(select(ServiceRequest).where(ServiceRequest.user_id == user_id, ServiceRequest.idempotency_key == key))


def same_submission(record, payload):
    if record.payload != payload:
        raise HTTPException(409, "Эта заявка уже отправлена с другими параметрами. Начните новую заявку.")
    return record


@router.post("/requests", response_model=RequestOutput, status_code=201)
def create_request(data: CreateRequest, user: CurrentUser, db: Db, response: Response):
    payload = data.details.model_dump(mode="json")
    existing = existing_request(db, user.id, data.idempotency_key)
    if existing:
        response.status_code = 200
        return same_submission(existing, payload)
    now = utcnow()
    record = ServiceRequest(id="IC-" + uuid4().hex.upper(), user_id=user.id,
        organization_id=user.organization_id, idempotency_key=data.idempotency_key,
        status="new", payload=payload, contact=Profile.model_validate(user).model_dump(),
        history=[{"status": "new", "at": now.isoformat()}], created_at=now)
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = existing_request(db, user.id, data.idempotency_key)
        if not existing:
            raise
        response.status_code = 200
        return same_submission(existing, payload)
    return record


@router.get("/requests", response_model=list[RequestOutput])
def my_requests(user: CurrentUser, db: Db, response: Response, offset: int = Query(0, ge=0)):
    response.headers["Cache-Control"] = "no-store"
    return db.scalars(select(ServiceRequest).where(ServiceRequest.user_id == user.id)
        .order_by(ServiceRequest.created_at.desc()).offset(offset).limit(50)).all()


@router.get("/requests/{request_id}", response_model=RequestOutput)
def request_detail(request_id: str, user: CurrentUser, db: Db, response: Response):
    response.headers["Cache-Control"] = "no-store"
    record = db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id, ServiceRequest.user_id == user.id))
    if not record:
        raise HTTPException(404, "Заявка не найдена.")
    return record


@router.get("/staff/requests", response_model=list[RequestOutput])
def staff_requests(manager: Manager, db: Db, response: Response, offset: int = Query(0, ge=0)):
    response.headers["Cache-Control"] = "no-store"
    return db.scalars(select(ServiceRequest).order_by(ServiceRequest.created_at.desc()).offset(offset).limit(50)).all()


@router.patch("/staff/requests/{request_id}", response_model=RequestOutput)
def update_request(request_id: str, data: StatusInput, manager: Manager, db: Db):
    record = db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id).with_for_update())
    if not record:
        raise HTTPException(404, "Заявка не найдена.")
    if record.status != data.status:
        record.status = data.status
        record.history = [*record.history, {"status": data.status, "at": utcnow().isoformat(), "actor": manager.id}]
        db.commit()
    return record
