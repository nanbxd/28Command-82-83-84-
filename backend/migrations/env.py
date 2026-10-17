from alembic import context
from app.config import get_settings
from app.db import get_engine
from app.models import Base
from app import operations_models  # noqa: F401 — register operational metadata
from app import coins_models  # noqa: F401 — register IC-coins metadata
from app import support_models  # noqa: F401
from app import settlement_models  # noqa: F401

if context.is_offline_mode():
    context.configure(url=get_settings().sqlalchemy_url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    with get_engine().connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
