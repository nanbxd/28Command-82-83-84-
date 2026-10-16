import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Organization, ServiceObject, WorkShift
from .schemas import DaySummary, ObjectSummary, Overview, WorkGroup
from .seed import DATA_PATH

DEMO_ORGANIZATION_ID = "demo-medeu"
LOCAL_TZ = timezone(timedelta(hours=5))


def local_time(value: datetime) -> datetime:
    return value.replace(tzinfo=LOCAL_TZ) if value.tzinfo is None else value.astimezone(LOCAL_TZ)


def build_overview(db: Session, day: date | None) -> Overview:
    # This public demo route is permanently scoped to the sanitized demo tenant.
    # Future authenticated client endpoints must derive their tenant from a session.
    org = db.scalar(select(Organization).where(
        Organization.id == DEMO_ORGANIZATION_ID, Organization.is_demo.is_(True),
    ))
    if org is None:
        raise HTTPException(503, "Демонстрационные данные ещё не загружены.")
    objects = db.scalars(select(ServiceObject).where(ServiceObject.organization_id == org.id)).all()
    shifts = db.scalars(select(WorkShift).where(
        WorkShift.organization_id == org.id,
        WorkShift.object_id.in_([obj.id for obj in objects]),
    ).order_by(WorkShift.work_date, WorkShift.planned_start)).all()
    if not shifts:
        raise HTTPException(503, "План работ ещё не загружен.")
    start, end = shifts[0].work_date, shifts[-1].work_date
    selected = day or end
    if not start <= selected <= end:
        raise HTTPException(422, "Выберите дату в пределах доступного периода.")
    daily: dict[date, list[int]] = defaultdict(lambda: [0, 0])
    groups: dict[tuple, list[int]] = defaultdict(lambda: [0, 0, 0])
    for shift in shifts:
        has_marks = int(shift.actual_start is not None and shift.actual_end is not None)
        daily[shift.work_date][0] += 1
        daily[shift.work_date][1] += has_marks
        if shift.work_date == selected:
            a, b = local_time(shift.planned_start), local_time(shift.planned_end)
            key = (a.strftime("%H:%M"), b.strftime("%H:%M"), shift.role, b.date() > a.date())
            group = groups[key]
            group[0] += 1
            group[1] += has_marks
            group[2] += int(shift.checklist_recorded)
    sources = json.loads(DATA_PATH.read_text(encoding="utf-8"))["sources"]
    return Overview(
        organization=org.name, is_demo=True, period_start=start, period_end=end,
        selected_date=selected, objects=[ObjectSummary.model_validate(obj) for obj in objects],
        total_area_sqm=sum(obj.area_sqm for obj in objects), planned_shifts=len(shifts),
        shifts_with_marks=sum(counts[1] for counts in daily.values()),
        days=[DaySummary(date=d, planned=c[0], with_marks=c[1]) for d, c in sorted(daily.items())],
        work_groups=[WorkGroup(role=k[2], start=k[0], end=k[1], ends_next_day=k[3],
                               planned=v[0], with_marks=v[1], checklist_recorded=v[2])
                     for k, v in sorted(groups.items())],
        sources=sources,
    )
