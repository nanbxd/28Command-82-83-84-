from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, JSON, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .models import Base


class ServiceAct(Base):
    __tablename__ = 'service_acts'
    __table_args__ = (UniqueConstraint('project_id', 'request_key', name='uq_act_request'),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    request_key: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(20))
    beneficiary_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    contractor_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default='draft')
    snapshot: Mapped[dict] = mapped_column(JSON)
    lines: Mapped[list] = mapped_column(JSON)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    vat: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    payment_state: Mapped[str] = mapped_column(String(20), default='none')
    platform: Mapped[dict] = mapped_column(JSON, default=dict)
    history: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ActWork(Base):
    # Reservation spans periods, so overlapping date ranges cannot bill a zone twice.
    __tablename__ = 'act_work'
    kind: Mapped[str] = mapped_column(String(20), primary_key=True)
    visit_id: Mapped[str] = mapped_column(ForeignKey('visits.id'), primary_key=True)
    act_id: Mapped[str] = mapped_column(ForeignKey('service_acts.id'), index=True)
