from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import get_db
from .overview import build_overview
from .schemas import Overview
from .auth import router as auth_router
from .requests import router as requests_router

app = FastAPI(title="IC Group Client API", version="0.1.0")
app.add_middleware(CORSMiddleware,
    allow_origins=[origin.strip() for origin in get_settings().frontend_origin.split(",")],
    allow_credentials=False, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Accept", "Content-Type", "Authorization"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(auth_router)
app.include_router(requests_router)


@app.exception_handler(RequestValidationError)
async def invalid_input(_request, exception):
    # Do not reflect passwords or other submitted personal data in validation responses.
    return JSONResponse(status_code=422, content={
        "detail": "Проверьте заполненные поля и попробуйте ещё раз.",
        "fields": [".".join(str(part) for part in error["loc"]) for error in exception.errors()],
    })


@app.exception_handler(SQLAlchemyError)
async def database_error(_request, _exception):
    return JSONResponse(status_code=503, content={"detail": "Данные временно недоступны. Попробуйте обновить страницу."})


def require_demo(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    if not settings.demo_mode:
        raise HTTPException(404, "Not found")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def ready(db: Annotated[Session, Depends(get_db)]) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.get("/api/v1/demo/overview", response_model=Overview, dependencies=[Depends(require_demo)])
def overview(db: Annotated[Session, Depends(get_db)], day: date | None = None) -> Overview:
    return build_overview(db, day)
