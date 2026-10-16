"""Operational records. Client ownership is always inherited from a submitted request."""
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, LargeBinary, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .models import Base


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("request_id", "object_index", name="uq_project_request_object"),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    contractor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    request_id: Mapped[str] = mapped_column(ForeignKey("service_requests.id"), index=True)
    object_index: Mapped[int] = mapped_column(Integer)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    details: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="preparation")
    plan: Mapped[str] = mapped_column(String(10000), default="")
    contract_number: Mapped[str] = mapped_column(String(120), default="")
    contract_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    contract_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    service_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    service_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(16, 2), nullable=True)
    payment_terms: Mapped[str] = mapped_column(String(2000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Visit(Base):
    __tablename__ = "visits"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("cleaning_runs.id"), nullable=True, index=True)
    zone: Mapped[str] = mapped_column(String(200), default="", server_default="")
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    planned_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    planned_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="planned")
    checklist: Mapped[list] = mapped_column(JSON)
    notes: Mapped[str] = mapped_column(String(5000), default="")
    history: Mapped[list] = mapped_column(JSON)


class CleaningRun(Base):
    __tablename__ = "cleaning_runs"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    contractor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StoredFile(Base):
    __tablename__ = "stored_files"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    visit_id: Mapped[str | None] = mapped_column(ForeignKey("visits.id"), nullable=True, index=True)
    complaint_id: Mapped[str | None] = mapped_column(ForeignKey("complaints.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(240))
    content_type: Mapped[str] = mapped_column(String(80))
    size: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period: Mapped[str] = mapped_column(String(120), default="")
    # Upload and acceptance are separate facts; immutable versions remain downloadable.
    state: Mapped[str] = mapped_column(String(30), default="uploaded")
    history: Mapped[list] = mapped_column(JSON)


class Complaint(Base):
    __tablename__ = "complaints"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    subject: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(String(5000))
    status: Mapped[str] = mapped_column(String(30), default="open")
    forwarded_to: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    history: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
