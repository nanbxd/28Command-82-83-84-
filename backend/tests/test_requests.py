from datetime import timedelta
import copy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import utcnow
from app.db import get_db
from app.main import app
from app.models import AuthSession, Base, ServiceRequest, User


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def account(client, email="client@example.com", **changes):
    data = dict(email=email, password="a strong password 42", name="Test Client", phone="+7 700 123 45 67", company="Test company")
    data.update(changes)
    return client.post("/api/v1/auth/register", json=data)


def headers(client, email="client@example.com"):
    response = account(client, email)
    assert response.status_code == 201
    return {"Authorization": "Bearer " + response.json()["access_token"]}


@pytest.fixture()
def submission():
    schedule = {"days": [1, 2, 3, 4, 5], "start_time": "20:00", "duration_hours": 8}
    return {"idempotency_key": "request-key-12345678", "details": {"objects": [{
        "object_type": "office", "segment": "Finance", "name": "Office A", "city": "Almaty", "address": "Test street 12", "area_sqm": 1500,
        "base_schedule": schedule, "support_positions": [{"role": "Cleaner", "count": 2, "schedule": schedule}],
        "bathrooms": 4, "hygiene_materials": True, "general_cleaning": "monthly", "notes": "Check access",
    }], "monthly_budget": 1000000, "desired_start": "2026-11-01"}}


def test_registration_hash_session_and_logout(client, db):
    response = account(client, email="Client@Example.COM", password="  password with spaces  ")
    assert response.status_code == 201
    data = response.json()
    user = db.scalar(select(User))
    assert user.email == "client@example.com" and user.role == "client"
    assert user.password_hash.startswith("$argon2id$")
    session = db.scalar(select(AuthSession))
    assert session.token_hash != data["access_token"]
    assert "password" not in data["user"] and "password_hash" not in data["user"]
    assert client.post("/api/v1/auth/login", json={"email": "client@example.com", "password": "password with spaces"}).status_code == 401
    login = client.post("/api/v1/auth/login", json={"email": "client@example.com", "password": "  password with spaces  "})
    assert login.status_code == 200
    auth = {"Authorization": "Bearer " + login.json()["access_token"]}
    assert client.get("/api/v1/auth/me", headers=auth).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=auth).status_code == 204
    assert client.get("/api/v1/auth/me", headers=auth).status_code == 401


def test_registration_validation_and_no_self_assigned_roles(client, db):
    invalid = account(client, password="short")
    assert invalid.status_code == 422
    assert "short" not in invalid.text and "input" not in invalid.json()
    assert account(client, phone="invalid phone").status_code == 422
    assert account(client, role="manager").status_code == 422
    assert account(client, company="  ").status_code == 422
    assert account(client).status_code == 201
    assert account(client, email="CLIENT@example.com").status_code == 409
    assert db.scalar(select(func.count()).select_from(User)) == 1


def test_unauthenticated_and_expired_sessions_cannot_send(client, db, submission):
    assert client.post("/api/v1/requests", json=submission).status_code == 401
    auth = headers(client)
    session = db.scalar(select(AuthSession))
    session.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert client.post("/api/v1/requests", json=submission, headers=auth).status_code == 401
    assert db.scalar(select(func.count()).select_from(ServiceRequest)) == 0


def test_full_snapshot_multiple_objects_idempotency_and_contact_source(client, db, submission):
    auth = headers(client)
    second = copy.deepcopy(submission["details"]["objects"][0])
    second.update(name="Second object", city="Astana", area_sqm=2300)
    submission["details"]["objects"].append(second)
    response = client.post("/api/v1/requests", json=submission, headers=auth)
    assert response.status_code == 201
    saved = response.json()
    assert saved["payload"] == submission["details"]
    assert saved["contact"]["phone"] == "+77001234567"
    assert saved["status"] == "new"
    assert client.post("/api/v1/requests", json=submission, headers=auth).json()["id"] == saved["id"]
    assert db.scalar(select(func.count()).select_from(ServiceRequest)) == 1
    submission["details"]["objects"][0]["area_sqm"] = 2000
    assert client.post("/api/v1/requests", json=submission, headers=auth).status_code == 409


def test_other_client_and_unprivileged_staff_access_denied(client, db, submission):
    owner = headers(client)
    other = headers(client, "other@example.com")
    record = client.post("/api/v1/requests", json=submission, headers=owner).json()
    assert client.get("/api/v1/requests", headers=other).json() == []
    assert client.get(f"/api/v1/requests/{record['id']}", headers=other).status_code == 404
    assert client.get("/api/v1/staff/requests", headers=owner).status_code == 403
    assert client.patch(f"/api/v1/staff/requests/{record['id']}", json={"status": "closed"}, headers=owner).status_code == 403
    user = db.scalar(select(User).where(User.email == "other@example.com"))
    owner_user = db.scalar(select(User).where(User.email == "client@example.com"))
    assert user.organization_id != owner_user.organization_id  # Same supplied company name grants no tenant membership.
    user.role = "manager"
    db.commit()
    assert client.get("/api/v1/staff/requests", headers=other).json()[0]["contact"]["email"] == "client@example.com"
    assert client.patch(f"/api/v1/staff/requests/{record['id']}", json={"status": "in_review"}, headers=other).status_code == 200
    own = client.get(f"/api/v1/requests/{record['id']}", headers=owner).json()
    assert own["status"] == "in_review" and len(own["history"]) == 2


def test_invalid_request_is_not_persisted(client, db, submission):
    auth = headers(client)
    for field, value in (("area_sqm", -2), ("bathrooms", -1), ("object_type", "unknown")):
        bad = copy.deepcopy(submission)
        bad["details"]["objects"][0][field] = value
        assert client.post("/api/v1/requests", json=bad, headers=auth).status_code == 422
    submission["details"]["objects"][0]["base_schedule"]["days"] = []
    assert client.post("/api/v1/requests", json=submission, headers=auth).status_code == 422
    assert db.scalar(select(func.count()).select_from(ServiceRequest)) == 0


def test_repeated_failed_login_is_limited(client):
    for _ in range(12):
        assert client.post("/api/v1/auth/login", json={"email": "unknown@example.com", "password": "incorrect"}).status_code == 401
    response = client.post("/api/v1/auth/login", json={"email": "unknown@example.com", "password": "incorrect"})
    assert response.status_code == 429 and response.headers["Retry-After"] == "900"
