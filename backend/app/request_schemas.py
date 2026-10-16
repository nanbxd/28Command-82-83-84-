import re
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class LoginInput(StrictModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalized_email(cls, value):
        return value.strip().lower()

    @field_validator("password", mode="before")
    @classmethod
    def preserve_password(cls, value):
        # Passwords are opaque; never trim whitespace before hashing.
        return value


class RegisterInput(LoginInput):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=10, max_length=30)
    company: str = Field(min_length=2, max_length=240)

    @field_validator("name", "company")
    @classmethod
    def required_text(cls, value):
        if len(value.strip()) < 2:
            raise ValueError("Заполните поле")
        return value.strip()

    @field_validator("phone")
    @classmethod
    def phone_number(cls, value):
        value = re.sub(r"[\s()\-]", "", value)
        if not re.fullmatch(r"\+[1-9]\d{9,14}", value):
            raise ValueError("Укажите телефон с кодом страны, например +7 700 123 45 67")
        return value


class Profile(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    phone: str
    company: str
    role: str


class SessionOutput(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: Profile


class Schedule(StrictModel):
    days: list[Annotated[int, Field(ge=1, le=7)]] = Field(min_length=1, max_length=7)
    start_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    duration_hours: float = Field(gt=0, le=24)

    @field_validator("days")
    @classmethod
    def unique_days(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Дни не должны повторяться")
        return sorted(value)


class SupportPosition(StrictModel):
    role: str = Field(min_length=2, max_length=160)
    count: int = Field(ge=1, le=1000)
    schedule: Schedule


class ObjectInput(StrictModel):
    object_type: Literal["office", "retail", "warehouse", "production", "medical", "other"]
    segment: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=160)
    city: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=3, max_length=300)
    area_sqm: float = Field(gt=0, le=10_000_000)
    base_schedule: Schedule
    support_positions: list[SupportPosition] = Field(max_length=10)
    bathrooms: int = Field(ge=0, le=10000)
    hygiene_materials: bool
    general_cleaning: Literal["none", "once", "monthly", "quarterly", "discuss"]
    notes: str = Field(max_length=2000)


class RequestInput(StrictModel):
    objects: list[ObjectInput] = Field(min_length=1, max_length=20)
    monthly_budget: float | None = Field(default=None, gt=0, le=1_000_000_000_000)
    desired_start: date | None = None


class CreateRequest(StrictModel):
    idempotency_key: str = Field(pattern=r"^[a-zA-Z0-9-]{16,80}$")
    details: RequestInput


class RequestOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    status: str
    created_at: datetime
    payload: RequestInput
    contact: Profile
    history: list[dict]


class StatusInput(StrictModel):
    status: Literal["new", "in_review", "contacted", "closed"]
