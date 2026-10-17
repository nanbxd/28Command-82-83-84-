"""Immutable priced service acts and exclusive work reservations."""
from alembic import op
import sqlalchemy as sa
revision = 'c28a14f03006'
down_revision = 'c28a14f03005'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('service_acts',
        sa.Column('id', sa.String(80), primary_key=True),
        sa.Column('project_id', sa.String(80), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('request_key', sa.String(80), nullable=False),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('beneficiary_id', sa.String(80), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('contractor_id', sa.String(80), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('snapshot', sa.JSON(), nullable=False),
        sa.Column('lines', sa.JSON(), nullable=False),
        sa.Column('subtotal', sa.Numeric(18, 2), nullable=False),
        sa.Column('vat_rate', sa.Numeric(5, 2), nullable=False),
        sa.Column('vat', sa.Numeric(18, 2), nullable=False),
        sa.Column('total', sa.Numeric(18, 2), nullable=False),
        sa.Column('payment_state', sa.String(20), nullable=False),
        sa.Column('platform', sa.JSON(), nullable=False),
        sa.Column('history', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('project_id', 'request_key', name='uq_act_request'))
    op.create_index('ix_service_acts_project_id', 'service_acts', ['project_id'])
    op.create_table('act_work',
        sa.Column('kind', sa.String(20), primary_key=True),
        sa.Column('visit_id', sa.String(80), sa.ForeignKey('visits.id'), primary_key=True),
        sa.Column('act_id', sa.String(80), sa.ForeignKey('service_acts.id'), nullable=False))
    op.create_index('ix_act_work_act_id', 'act_work', ['act_id'])


def downgrade():
    op.drop_table('act_work')
    op.drop_table('service_acts')
