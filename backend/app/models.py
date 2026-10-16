from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(240))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class ServiceObject(Base):
    __tablename__ = "service_objects"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(240))
    scope: Mapped[str] = mapped_column(String(500))
    city: Mapped[str] = mapped_column(String(120))
    area_sqm: Mapped[int] = mapped_column(Integer)
    contract_number: Mapped[str] = mapped_column(String(120))
    contract_status: Mapped[str] = mapped_column(String(80))


class WorkShift(Base):
    __tablename__ = "work_shifts"
    __table_args__ = (Index("ix_shift_organization_date", "organization_id", "work_date"),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    object_id: Mapped[str] = mapped_column(ForeignKey("service_objects.id"))
    work_date: Mapped[date] = mapped_column(Date)
    role: Mapped[str] = mapped_column(String(300))
    planned_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    planned_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checklist_recorded: Mapped[bool] = mapped_column(Boolean, default=False)
    plan_row: Mapped[int] = mapped_column(Integer)
    fact_row: Mapped[int | None] = mapped_column(Integer, nullable=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(30))
    company: Mapped[str] = mapped_column(String(240))
    role: Mapped[str] = mapped_column(String(30), default="client")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class AuthAttempt(Base):
    __tablename__ = "auth_attempts"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    scope_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ServiceRequest(Base):
    __tablename__ = "service_requests"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key", name="uq_request_user_key"),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(30), default="new")
    payload: Mapped[dict] = mapped_column(JSON)
    contact: Mapped[dict] = mapped_column(JSON)
    history: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
