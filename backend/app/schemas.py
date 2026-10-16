from datetime import date
from pydantic import BaseModel, ConfigDict


class ObjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    scope: str
    city: str
    area_sqm: int
    contract_number: str
    contract_status: str


class DaySummary(BaseModel):
    date: date
    planned: int
    with_marks: int


class WorkGroup(BaseModel):
    role: str
    start: str
    end: str
    ends_next_day: bool
    planned: int
    with_marks: int
    checklist_recorded: int


class DataSource(BaseModel):
    file: str
    sheet: str
    rows: str
    purpose: str


class Overview(BaseModel):
    organization: str
    is_demo: bool
    period_start: date
    period_end: date
    selected_date: date
    objects: list[ObjectSummary]
    total_area_sqm: int
    planned_shifts: int
    shifts_with_marks: int
    days: list[DaySummary]
    work_groups: list[WorkGroup]
    sources: list[DataSource]
