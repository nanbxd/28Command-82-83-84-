from typing import Annotated
import logging

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
from .auth import router as auth_router
from .requests import router as requests_router
from .operations import router as operations_router
from .accounts import router as accounts_router
from .coins import router as coins_router

app = FastAPI(title="IC Group Client API", version="0.1.0")
app.add_middleware(CORSMiddleware,
    allow_origins=[origin.strip() for origin in get_settings().frontend_origin.split(",")],
    allow_credentials=False, allow_methods=["GET", "POST", "PUT", "PATCH"], allow_headers=["Accept", "Content-Type", "Authorization"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(auth_router)
app.include_router(requests_router)
app.include_router(operations_router)
app.include_router(accounts_router)
app.include_router(coins_router)


@app.middleware("http")
async def private_responses(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def invalid_input(_request, exception):
    if _request.url.path.startswith("/api/v1/visits/") and _request.url.path.endswith("/actions"):
        logging.getLogger(__name__).warning("visit_action_rejected reason=invalid_request_schema")
    # Do not reflect passwords or other submitted personal data in validation responses.
    return JSONResponse(status_code=422, content={
        "detail": "Проверьте заполненные поля и попробуйте ещё раз.",
        "fields": [".".join(str(part) for part in error["loc"]) for error in exception.errors()],
    })


@app.exception_handler(SQLAlchemyError)
async def database_error(_request, _exception):
    return JSONResponse(status_code=503, content={"detail": "Данные временно недоступны. Попробуйте обновить страницу."})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def ready(db: Annotated[Session, Depends(get_db)]) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ready"}
