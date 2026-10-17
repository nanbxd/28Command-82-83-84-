from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base


class BonusRequest(Base):
    __tablename__ = "coin_requests"
    __table_args__ = (
        Index("uq_coin_request_active_work", "worker_id", "dedup_key", unique=True,
            postgresql_where=text("status IN ('pending', 'approved')"),
            sqlite_where=text("status IN ('pending', 'approved')")),
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="ck_coin_request_status"),
        CheckConstraint("amount IS NULL OR amount BETWEEN 50 AND 150", name="ck_coin_request_amount"),
    )
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    contractor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    way: Mapped[str] = mapped_column(String(30))
    date: Mapped[date] = mapped_column(Date)
    reference: Mapped[str] = mapped_column(String(180))
    note: Mapped[str] = mapped_column(String(500))
    dedup_key: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    decision_note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CoinTransaction(Base):
    __tablename__ = "coin_transactions"
    __table_args__ = (
        UniqueConstraint("worker_id", "event_key", name="uq_coin_transaction_event"),
        CheckConstraint("amount <> 0", name="ck_coin_transaction_nonzero"),
    )
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    event_key: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(20))
    amount: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(240))
    request_id: Mapped[str | None] = mapped_column(ForeignKey("coin_requests.id"), unique=True, nullable=True)
    product_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
