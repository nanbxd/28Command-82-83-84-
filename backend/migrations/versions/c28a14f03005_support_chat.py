"""Private persistent AI support conversations."""
from alembic import op
import sqlalchemy as sa
revision = 'c28a14f03005'
down_revision = 'c28a14f03004'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('support_turns',
        sa.Column('id', sa.String(80), primary_key=True),
        sa.Column('user_id', sa.String(80), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('request_key', sa.String(80), nullable=False),
        sa.Column('user_role', sa.String(30), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('error', sa.String(300), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('attempt_id', sa.String(80), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('user_id', 'request_key', name='uq_support_user_request'))
    op.create_index('ix_support_turns_user_id', 'support_turns', ['user_id'])
    op.create_index('ix_support_turns_created_at', 'support_turns', ['created_at'])


def downgrade():
    op.drop_table('support_turns')
