"""Promote an existing registered account; never accepts roles from public signup."""
import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_engine
from .models import User


def main():
    parser = argparse.ArgumentParser(description="Grant IC Group manager access to an existing account")
    parser.add_argument("email", help="Email of an already registered staff member")
    args = parser.parse_args()
    with Session(get_engine()) as db:
        user = db.scalar(select(User).where(User.email == args.email.strip().lower()))
        if not user:
            raise SystemExit("Account not found. Register the staff account first.")
        user.role = "manager"
        db.commit()
    print("Manager role granted.")


if __name__ == "__main__":
    main()
