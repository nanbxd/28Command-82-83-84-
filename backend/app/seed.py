"""Idempotently import the explicitly enabled, sanitized demonstration snapshot."""
import json
from datetime import date, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_engine
from .models import Organization, ServiceObject, WorkShift

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "demo_client.json"


def load_demo(session: Session) -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    session.merge(Organization(**data["organization"]))
    session.flush()
    for item in data["objects"]:
        session.merge(ServiceObject(**item))
    session.flush()
    for item in data["shifts"]:
        values = dict(item)
        values["work_date"] = date.fromisoformat(values["work_date"])
        for key in ("planned_start", "planned_end", "actual_start", "actual_end"):
            values[key] = datetime.fromisoformat(values[key]) if values[key] else None
        session.merge(WorkShift(**values))
    session.commit()


if __name__ == "__main__":
    if get_settings().demo_mode:
        with Session(get_engine()) as db:
            load_demo(db)
        print("Demo snapshot loaded.")
    else:
        print("DEMO_MODE is disabled; no demo data imported.")
