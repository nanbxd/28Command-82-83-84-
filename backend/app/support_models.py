from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .models import Base


class SupportTurn(Base):
    __tablename__ = 'support_turns'
    __table_args__ = (UniqueConstraint('user_id', 'request_key', name='uq_support_user_request'),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    request_key: Mapped[str] = mapped_column(String(80))
    user_role: Mapped[str] = mapped_column(String(30))
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default='')
    status: Mapped[str] = mapped_column(String(20))
    error: Mapped[str] = mapped_column(String(300), default='')
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    attempt_id: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
