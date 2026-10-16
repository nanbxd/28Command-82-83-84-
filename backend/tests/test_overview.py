from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.db import get_db
from app.main import app
from app.models import Base, Organization, ServiceObject, WorkShift
from app.seed import load_demo


@pytest.fixture()
def database():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        load_demo(session)
        yield session
    engine.dispose()


@pytest.fixture()
def client(database):
    app.dependency_overrides[get_db] = lambda: database
    app.dependency_overrides[get_settings] = lambda: Settings(demo_mode=True)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_package_totals_and_day_selection(client):
    response = client.get("/api/v1/demo/overview")
    assert response.status_code == 200
    data = response.json()
    assert data["planned_shifts"] == 729
    assert data["shifts_with_marks"] == 705
    assert data["total_area_sqm"] == 21400
    assert len(data["days"]) == 30
    assert data["selected_date"] == "2026-09-30"
    day = client.get("/api/v1/demo/overview?day=2026-09-16").json()
    assert day["selected_date"] == "2026-09-16"
    selected_summary = next(item for item in day["days"] if item["date"] == day["selected_date"])
    assert sum(group["planned"] for group in day["work_groups"]) == selected_summary["planned"]
    assert any(group["ends_next_day"] for group in day["work_groups"])


def test_demo_cannot_expose_another_organization(client, database):
    database.add(Organization(id="other", name="Private client", is_demo=False))
    database.flush()
    database.add(ServiceObject(id="other-object", organization_id="other", name="Private object",
        scope="Private scope", city="Other city", area_sqm=100, contract_number="PRIVATE", contract_status="active"))
    database.flush()
    database.add(WorkShift(id="other-shift", organization_id="other", object_id="other-object",
        work_date=date(2026, 9, 30), role="Private role",
        planned_start=datetime(2026, 9, 30, 10, tzinfo=timezone.utc),
        planned_end=datetime(2026, 9, 30, 12, tzinfo=timezone.utc), checklist_recorded=False, plan_row=1))
    database.commit()
    response = client.get("/api/v1/demo/overview?organization_id=other")
    assert "Private" not in response.text
    assert response.json()["planned_shifts"] == 729
    assert len(response.json()["objects"]) == 1
    assert not any(key in response.text for key in ('operator', 'subcontractor', 'margin', 'salary'))


def test_demo_disabled_and_invalid_dates(client):
    assert client.get("/api/v1/demo/overview?day=2026-10-01").status_code == 422
    assert client.get("/api/v1/demo/overview?day=invalid").status_code == 422
    app.dependency_overrides[get_settings] = lambda: Settings(demo_mode=False)
    assert client.get("/api/v1/demo/overview").status_code == 404


def test_seed_is_repeatable(database):
    load_demo(database)
    assert database.scalar(select(func.count()).select_from(WorkShift)) == 729
    assert database.scalar(select(func.count()).select_from(Organization)) == 1
