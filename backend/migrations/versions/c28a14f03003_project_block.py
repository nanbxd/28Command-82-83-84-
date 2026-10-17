"""Independent object block and audit trail."""
from alembic import op
import sqlalchemy as sa
revision = 'c28a14f03003'
down_revision = 'c28a14f03002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('is_blocked', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('projects', sa.Column('blocking_history', sa.JSON(), nullable=False, server_default='[]'))


def downgrade():
    op.drop_column('projects', 'blocking_history')
    op.drop_column('projects', 'is_blocked')
