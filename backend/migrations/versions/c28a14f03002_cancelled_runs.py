"""Retain cancelled cleaning plans without blocking contractor reassignment."""
from alembic import op
import sqlalchemy as sa

revision = 'c28a14f03002'
down_revision = 'c28a14f03001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cleaning_runs', sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('cleaning_runs', 'cancelled_at')
