"""Idempotent environment-owned superadmin, run after migrations and before serving."""
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from pydantic import TypeAdapter, EmailStr
from uuid import uuid4
from .auth import password_hasher, utcnow
from .config import get_settings
from .db import get_engine
from .models import AuthSession, Organization, User


def bootstrap(db: Session, settings):
    if not settings.superadmin_email or not settings.superadmin_password.get_secret_value():
        raise RuntimeError("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD before starting the API.")
    email = str(TypeAdapter(EmailStr).validate_python(settings.superadmin_email)).lower()
    password = settings.superadmin_password.get_secret_value()
    if not 12 <= len(password) <= 128:
        raise RuntimeError("SUPERADMIN_PASSWORD must contain 12 to 128 characters.")
    user = db.scalar(select(User).where(User.email == email))
    if user and user.role != "superadmin":
        raise RuntimeError("SUPERADMIN_EMAIL belongs to an existing non-superadmin account. Choose a separate address.")
    if user:
        if not password_hasher.verify(password, user.password_hash):
            user.password_hash = password_hasher.hash(password)
            db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        user.is_active = True
    else:
        organization = Organization(id=str(uuid4()), name="IC Group")
        db.add(organization)
        db.flush()
        db.add(User(id=str(uuid4()), organization_id=organization.id, email=email,
                    password_hash=password_hasher.hash(password), name="Суперадминистратор",
                    phone="", company="IC Group", role="superadmin", is_active=True, created_at=utcnow()))
    db.commit()


if __name__ == "__main__":
    with Session(get_engine()) as session:
        bootstrap(session, get_settings())
    print("Superadmin is configured.")
