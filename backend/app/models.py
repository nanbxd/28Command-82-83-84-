from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String
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
