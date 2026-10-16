from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
from typing import Literal
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import AwareDatetime, Field, model_validator
from sqlalchemy import select

from .auth import CurrentUser, Db, Manager, utcnow
from .models import Organization, ServiceRequest, User
from .operations_models import Complaint, Project, StoredFile, Visit
from .request_schemas import StrictModel

router = APIRouter(prefix="/api/v1", tags=["Service operations"])
STAFF = {"manager", "superadmin"}
LOCAL = timezone(timedelta(hours=5))
MAX_FILE = 8 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000


def event(user, action, text=""):
    return {"at": utcnow().isoformat(), "actor": user.name, "actor_id": user.id, "action": action, "text": text}


def project_access(db, user, project_id):
    project = db.get(Project, project_id)
    if project and (user.role in STAFF or (user.role == "client" and project.organization_id == user.organization_id)):
        return project
    if project and user.role == "worker" and db.scalar(select(Visit.id).where(Visit.project_id == project.id, Visit.worker_id == user.id)):
        return project
    raise HTTPException(404, "Объект не найден.")


def visit_access(db, user, visit_id, lock=False):
    query = select(Visit).where(Visit.id == visit_id)
    row = db.scalar(query.with_for_update() if lock else query)
    if not row:
        raise HTTPException(404, "Уборка не найдена.")
    project_access(db, user, row.project_id)
    if user.role == "worker" and row.worker_id != user.id:
        raise HTTPException(404, "Уборка не найдена.")
    return row


def complaint_access(db, user, complaint_id):
    row = db.get(Complaint, complaint_id)
    if not row:
        raise HTTPException(404, "Обращение не найдено.")
    project_access(db, user, row.project_id)
    if user.role == "worker" and row.forwarded_to != user.id:
        raise HTTPException(404, "Обращение не найдено.")
    return row


def file_access(db, user, row):
    if not row:
        raise HTTPException(404, "Файл не найден.")
    project_access(db, user, row.project_id)
    if row.complaint_id:
        complaint_access(db, user, row.complaint_id)
    elif row.visit_id:
        visit_access(db, user, row.visit_id)
    elif user.role == "worker":
        raise HTTPException(404, "Файл не найден.")


def file_output(row):
    return {key: getattr(row, key) for key in ("id", "project_id", "visit_id", "complaint_id", "kind", "name", "content_type", "size", "uploaded_at", "period", "state", "history")}


def visit_output(db, row):
    worker = db.get(User, row.worker_id)
    return {**{key: getattr(row, key) for key in ("id", "project_id", "worker_id", "planned_start", "planned_end", "actual_start", "actual_end", "status", "checklist", "notes", "history")}, "worker_name": worker.name}


def project_output(db, user, row):
    query = select(Visit).where(Visit.project_id == row.id)
    if user.role == "worker":
        query = query.where(Visit.worker_id == user.id)
    visits = list(db.scalars(query.order_by(Visit.planned_start.desc())))
    finished = [v.actual_end for v in visits if v.actual_end and v.status in {"submitted", "accepted"}]
    next_visit = next(iter(sorted([v for v in visits if v.status == "planned"], key=lambda v: v.planned_start)), None)
    result = {key: getattr(row, key) for key in ("id", "request_id", "name", "details", "status", "plan", "service_start", "service_end", "created_at")}
    result.update(company=db.get(Organization, row.organization_id).name,
        last_cleaning=max(finished) if finished else None,
        next_cleaning=next_visit.planned_start if next_visit else None,
        cleaning_now=any(v.status == "in_progress" for v in visits))
    if user.role != "worker":
        result.update({key: getattr(row, key) for key in ("contract_number", "contract_start", "contract_end", "price", "payment_terms")})
    return result


@router.post("/staff/requests/{request_id}/projects")
def convert_request(request_id: str, user: Manager, db: Db):
    # Serializing on the source request makes retries and concurrent conversions idempotent.
    source = db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id).with_for_update())
    if not source:
        raise HTTPException(404, "Заявка не найдена.")
    rows = list(db.scalars(select(Project).where(Project.request_id == source.id).order_by(Project.object_index)))
    if not rows:
        for index, details in enumerate(source.payload["objects"]):
            row = Project(id=str(uuid4()), request_id=source.id, object_index=index,
                organization_id=source.organization_id, name=details["name"], details=details,
                status="preparation", created_at=utcnow())
            db.add(row)
            rows.append(row)
        if source.status == "new":
            source.status = "in_review"
            source.history = [*source.history, {"status": "in_review", "at": utcnow().isoformat(), "actor_id": user.id}]
        db.commit()
    return [project_output(db, user, row) for row in rows]


@router.get("/projects")
def list_projects(user: CurrentUser, db: Db, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
    query = select(Project)
    if user.role == "client":
        query = query.where(Project.organization_id == user.organization_id)
    elif user.role == "worker":
        query = query.where(Project.id.in_(select(Visit.project_id).where(Visit.worker_id == user.id)))
    elif user.role not in STAFF:
        raise HTTPException(403, "Нет доступа.")
    return [project_output(db, user, row) for row in db.scalars(query.order_by(Project.created_at.desc(), Project.id).offset(offset).limit(limit))]


@router.get("/projects/{project_id}")
def get_project(project_id: str, user: CurrentUser, db: Db):
    row = project_access(db, user, project_id)
    query = select(Visit).where(Visit.project_id == row.id)
    if user.role == "worker":
        query = query.where(Visit.worker_id == user.id)
    files = []
    for f in db.scalars(select(StoredFile).where(StoredFile.project_id == row.id).order_by(StoredFile.uploaded_at.desc())):
        try:
            file_access(db, user, f)
            files.append(file_output(f))
        except HTTPException:
            pass
    return {**project_output(db, user, row), "visits": [visit_output(db, v) for v in db.scalars(query.order_by(Visit.planned_start.desc()))], "files": files}


class ProjectUpdate(StrictModel):
    status: Literal["preparation", "active", "paused", "completed"]
    plan: str = Field(max_length=10000)
    contract_number: str = Field(max_length=120)
    contract_start: date | None = None
    contract_end: date | None = None
    service_start: date | None = None
    service_end: date | None = None
    price: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    payment_terms: str = Field(max_length=2000)

    @model_validator(mode="after")
    def dates(self):
        for a, b in ((self.contract_start, self.contract_end), (self.service_start, self.service_end)):
            if a and b and b < a:
                raise ValueError("Дата окончания раньше начала")
        return self


@router.patch("/staff/projects/{project_id}")
def update_project(project_id: str, data: ProjectUpdate, user: Manager, db: Db):
    row = project_access(db, user, project_id)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return project_output(db, user, row)


class VisitInput(StrictModel):
    worker_id: str
    planned_start: AwareDatetime
    planned_end: AwareDatetime
    checklist: list[str] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def valid(self):
        self.planned_start = self.planned_start.astimezone(timezone.utc)
        self.planned_end = self.planned_end.astimezone(timezone.utc)
        if self.planned_end <= self.planned_start or self.planned_end - self.planned_start > timedelta(hours=14):
            raise ValueError("Длительность должна быть от 0 до 14 часов")
        self.checklist = [s.strip() for s in self.checklist]
        if any(not s or len(s) > 300 for s in self.checklist) or len(set(self.checklist)) != len(self.checklist):
            raise ValueError("Проверьте пункты чек-листа")
        return self


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def night(start, end):
    day = start.astimezone(LOCAL).date()
    while day <= end.astimezone(LOCAL).date():
        midnight = datetime.combine(day, datetime.min.time(), LOCAL)
        if start < midnight + timedelta(hours=5) and end > midnight:
            return True
        day += timedelta(days=1)
    return False


def validate_schedule(existing, data, project_id):
    # Source: participant package / 2_Таблицы / 07_Нормативы.json.
    intervals = [(aware(v.planned_start), aware(v.planned_end), v.project_id) for v in existing]
    start, end = data.planned_start, data.planned_end
    for a, b, pid in intervals:
        if start < b and end > a:
            raise HTTPException(409, "У работника уже назначена уборка в это время.")
        previous, following = ((a, b), (start, end)) if b <= start else ((start, end), (a, b))
        gap = following[0] - previous[1]
        required = timedelta(hours=8) if night(*previous) else timedelta(minutes=45 if pid != project_id else 0)
        if gap < required:
            raise HTTPException(409, "Недостаточно времени для перехода между объектами или отдыха после ночной смены.")
    all_intervals = intervals + [(start, end, project_id)]
    # Maximum overlap of any rolling window occurs at an interval boundary.
    for hours, maximum in ((24, 14), (168, 72)):
        width = timedelta(hours=hours)
        for edge in {v for a, b, _ in all_intervals for v in (a, b, a - width, b - width)}:
            total = sum(max(0, (min(b, edge + width) - max(a, edge)).total_seconds()) for a, b, _ in all_intervals)
            if total > maximum * 3600:
                raise HTTPException(409, f"Превышен норматив: {maximum} часов за {hours} часов.")


@router.post("/staff/projects/{project_id}/visits", status_code=201)
def schedule_visit(project_id: str, data: VisitInput, user: Manager, db: Db):
    project = project_access(db, user, project_id)
    if project.status in {"paused", "completed"}:
        raise HTTPException(409, "Возобновите обслуживание перед назначением уборки.")
    worker = db.scalar(select(User).where(User.id == data.worker_id).with_for_update())
    if not worker or worker.role != "worker" or not worker.is_active:
        raise HTTPException(422, "Выберите действующего работника.")
    if project.service_start and data.planned_start.astimezone(LOCAL).date() < project.service_start or project.service_end and data.planned_end.astimezone(LOCAL).date() > project.service_end:
        raise HTTPException(422, "Уборка выходит за период оказания услуг.")
    existing = list(db.scalars(select(Visit).where(Visit.worker_id == worker.id, Visit.status != "cancelled",
        Visit.planned_end > data.planned_start - timedelta(days=8), Visit.planned_start < data.planned_end + timedelta(days=8))))
    validate_schedule(existing, data, project_id)
    row = Visit(id=str(uuid4()), project_id=project_id, worker_id=worker.id,
        planned_start=data.planned_start, planned_end=data.planned_end,
        checklist=[{"text": s, "done": False} for s in data.checklist], notes="", status="planned", history=[event(user, "planned")])
    db.add(row)
    db.commit()
    return visit_output(db, row)


class VisitAction(StrictModel):
    action: Literal["start", "save", "submit", "accept", "return", "cancel"]
    checked: list[int] = Field(default_factory=list, max_length=100)
    notes: str = Field(default="", max_length=5000)


@router.post("/visits/{visit_id}/actions")
def visit_action(visit_id: str, data: VisitAction, user: CurrentUser, db: Db):
    row = visit_access(db, user, visit_id, lock=True)
    if user.role not in STAFF and user.role != "worker":
        raise HTTPException(403, "Изменять уборку может исполнитель или сотрудник IC Group.")
    if data.action in {"accept", "return", "cancel"} and user.role not in STAFF:
        raise HTTPException(403, "Приёмка доступна только IC Group.")
    kinds = set(db.scalars(select(StoredFile.kind).where(StoredFile.visit_id == row.id)))
    transitions = {"start": ({"planned"}, "in_progress"), "submit": ({"in_progress", "correction"}, "submitted"),
        "accept": ({"submitted"}, "accepted"), "return": ({"submitted"}, "correction"),
        "cancel": ({"planned"}, "cancelled"), "save": ({"in_progress", "correction"}, row.status)}
    allowed, status = transitions[data.action]
    if row.status not in allowed:
        raise HTTPException(409, "Состояние уборки изменилось. Обновите карточку.")
    if data.action == "start":
        if "before" not in kinds:
            raise HTTPException(422, "Добавьте фото до уборки.")
        # Serialize actual starts across objects for the same worker.
        db.scalar(select(User).where(User.id == row.worker_id).with_for_update())
        if db.scalar(select(Visit.id).where(Visit.worker_id == row.worker_id, Visit.id != row.id, Visit.status == "in_progress")):
            raise HTTPException(409, "У работника уже идёт другая уборка.")
        row.actual_start = utcnow()
    if data.action in {"save", "submit"}:
        if any(i < 0 or i >= len(row.checklist) for i in data.checked):
            raise HTTPException(422, "Неизвестный пункт чек-листа.")
        row.checklist = [{"text": item["text"], "done": i in data.checked} for i, item in enumerate(row.checklist)]
        row.notes = data.notes
    if data.action == "submit":
        if not {"before", "after"}.issubset(kinds) or not all(item["done"] for item in row.checklist):
            raise HTTPException(422, "Для отправки нужны фото до и после и выполненный чек-лист.")
        row.actual_end = utcnow()
    if data.action == "return" and not data.notes:
        raise HTTPException(422, "Укажите причину возврата отчёта.")
    row.status = status
    row.history = [*row.history, event(user, data.action, data.notes)]
    db.commit()
    return visit_output(db, row)


class ComplaintInput(StrictModel):
    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=5, max_length=5000)


def complaint_output(db, row):
    project = db.get(Project, row.project_id)
    return {**{key: getattr(row, key) for key in ("id", "project_id", "subject", "message", "status", "forwarded_to", "history", "created_at")},
        "project_name": project.name, "company": db.get(Organization, project.organization_id).name}


@router.post("/projects/{project_id}/complaints", status_code=201)
def create_complaint(project_id: str, data: ComplaintInput, user: CurrentUser, db: Db):
    project_access(db, user, project_id)
    if user.role != "client":
        raise HTTPException(403, "Претензию создаёт клиент.")
    row = Complaint(id=str(uuid4()), project_id=project_id, user_id=user.id, **data.model_dump(),
        status="open", history=[event(user, "created")], created_at=utcnow())
    db.add(row)
    db.commit()
    return complaint_output(db, row)


@router.get("/complaints")
def list_complaints(user: CurrentUser, db: Db, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
    query = select(Complaint).join(Project)
    if user.role == "client":
        query = query.where(Project.organization_id == user.organization_id)
    elif user.role == "worker":
        query = query.where(Complaint.forwarded_to == user.id)
    elif user.role not in STAFF:
        raise HTTPException(403, "Нет доступа.")
    return [complaint_output(db, row) for row in db.scalars(query.order_by(Complaint.created_at.desc(), Complaint.id).offset(offset).limit(limit))]


@router.get("/complaints/{complaint_id}")
def get_complaint(complaint_id: str, user: CurrentUser, db: Db):
    return complaint_output(db, complaint_access(db, user, complaint_id))


class ComplaintAction(StrictModel):
    text: str = Field(default="", max_length=5000)
    status: Literal["open", "review", "correction", "closed"] | None = None
    forwarded_to: str | None = None


@router.post("/complaints/{complaint_id}/reply")
def reply_complaint(complaint_id: str, data: ComplaintAction, user: CurrentUser, db: Db):
    # Lock before reading history to preserve concurrent replies.
    db.scalar(select(Complaint).where(Complaint.id == complaint_id).with_for_update())
    row = complaint_access(db, user, complaint_id)
    if not data.text.strip():
        raise HTTPException(422, "Добавьте сообщение для истории обращения.")
    if (data.status or "forwarded_to" in data.model_fields_set) and user.role not in STAFF:
        raise HTTPException(403, "Статус и передачу обращения меняет IC Group.")
    if "forwarded_to" in data.model_fields_set:
        if data.forwarded_to and not db.scalar(select(Visit.id).join(User, User.id == Visit.worker_id).where(
                Visit.project_id == row.project_id, Visit.worker_id == data.forwarded_to, User.is_active.is_(True))):
            raise HTTPException(422, "Передать обращение можно только назначенному работнику объекта.")
        row.forwarded_to = data.forwarded_to
    if data.status:
        row.status = data.status
    row.history = [*row.history, {**event(user, "reply", data.text), "status": row.status, "forwarded_to": row.forwarded_to}]
    db.commit()
    return complaint_output(db, row)


@router.post("/projects/{project_id}/files", status_code=201)
async def upload_file(project_id: str, request: Request, user: CurrentUser, db: Db,
        kind: Literal["before", "after", "contract", "attachment", "avr", "complaint"],
        name: str = Query(min_length=1, max_length=240), visit_id: str | None = None,
        complaint_id: str | None = None, period: str = Query("", max_length=120)):
    project_access(db, user, project_id)
    if kind in {"before", "after"}:
        visit = visit_access(db, user, visit_id, lock=True)
        if visit.project_id != project_id or user.role not in STAFF | {"worker"} or complaint_id:
            raise HTTPException(403, "Нет доступа к загрузке отчёта.")
        if visit.status not in ({"planned", "in_progress", "correction"} if kind == "before" else {"in_progress", "correction"}):
            raise HTTPException(409, "Фото нельзя добавить на этом этапе уборки.")
    elif kind == "complaint":
        complaint = complaint_access(db, user, complaint_id)
        if complaint.project_id != project_id or visit_id:
            raise HTTPException(422, "Файл относится к другому обращению.")
    elif user.role not in STAFF or visit_id or complaint_id:
        raise HTTPException(403, "Документы загружает сотрудник IC Group.")
    if kind == "avr" and not period.strip():
        raise HTTPException(422, "Укажите период акта.")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_FILE:
            raise HTTPException(413, "Максимальный размер файла — 8 МБ.")
        data.extend(chunk)
    if not data:
        raise HTTPException(422, "Выберите непустой файл.")
    if kind in {"before", "after", "complaint"}:
        try:
            with Image.open(BytesIO(data)) as picture:
                if picture.format not in {"JPEG", "PNG", "WEBP"} or picture.width * picture.height > 20_000_000:
                    raise ValueError()
                picture.load()
                # Normalize image payload and remove metadata (including location EXIF).
                output = BytesIO()
                ImageOps.exif_transpose(picture).convert("RGB").save(output, format="JPEG", quality=88)
                data = output.getvalue()
                if len(data) > MAX_FILE:
                    raise ValueError()
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise HTTPException(422, "Выберите JPEG, PNG или WebP до 20 мегапикселей и 8 МБ.")
        content_type = "image/jpeg"
        name = name.rsplit(".", 1)[0] + ".jpg"
    else:
        if not data.startswith(b"%PDF-"):
            raise HTTPException(422, "Договоры и акты принимаются в формате PDF.")
        content_type = "application/pdf"
    row = StoredFile(id=str(uuid4()), project_id=project_id, visit_id=visit_id, complaint_id=complaint_id,
        kind=kind, name=name, data=bytes(data), size=len(data), content_type=content_type,
        uploaded_by=user.id, uploaded_at=utcnow(), period=period, state="uploaded", history=[event(user, "uploaded")])
    db.add(row)
    db.commit()
    return file_output(row)


@router.get("/files/{file_id}")
def download_file(file_id: str, user: CurrentUser, db: Db):
    row = db.get(StoredFile, file_id)
    file_access(db, user, row)
    return Response(row.data, media_type=row.content_type, headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(row.name, safe='')}",
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


class DocumentState(StrictModel):
    state: Literal["uploaded", "signed", "accepted", "rejected"]
    note: str = Field(min_length=3, max_length=2000)


@router.patch("/staff/files/{file_id}")
def document_state(file_id: str, data: DocumentState, user: Manager, db: Db):
    row = db.scalar(select(StoredFile).where(StoredFile.id == file_id).with_for_update())
    file_access(db, user, row)
    if row.kind not in {"contract", "attachment", "avr"}:
        raise HTTPException(422, "Это не документ.")
    if data.state == "signed" and row.kind == "avr" or data.state in {"accepted", "rejected"} and row.kind != "avr":
        raise HTTPException(422, "Статус не подходит этому типу документа.")
    row.state = data.state
    row.history = [*row.history, event(user, data.state, data.note)]
    db.commit()
    return file_output(row)
