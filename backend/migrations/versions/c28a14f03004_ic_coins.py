"""Persistent worker bonuses, contractor decisions and coin transactions."""
from alembic import op
import sqlalchemy as sa

revision = 'c28a14f03004'
down_revision = 'c28a14f03003'
branch_labels = None
depends_on = None


def upgrade():
    # Two merged migrations previously shared revision 03003. Either may
    # already be applied; reconcile missing structures without deleting data.
    inspector = sa.inspect(op.get_bind())
    columns = {column['name'] for column in inspector.get_columns('projects')}
    if 'is_blocked' not in columns:
        op.add_column('projects', sa.Column('is_blocked', sa.Boolean(), nullable=False, server_default=sa.false()))
    if 'blocking_history' not in columns:
        op.add_column('projects', sa.Column('blocking_history', sa.JSON(), nullable=False, server_default='[]'))
    tables = set(inspector.get_table_names())
    if 'coin_requests' not in tables:
        op.create_table('coin_requests',
            sa.Column('id', sa.String(80), primary_key=True),
            sa.Column('worker_id', sa.String(80), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('contractor_id', sa.String(80), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('way', sa.String(30), nullable=False),
            sa.Column('date', sa.Date(), nullable=False),
            sa.Column('reference', sa.String(180), nullable=False),
            sa.Column('note', sa.String(500), nullable=False),
            sa.Column('dedup_key', sa.String(64), nullable=False),
            sa.Column('status', sa.String(20), nullable=False),
            sa.Column('amount', sa.Integer(), nullable=True),
            sa.Column('decision_note', sa.String(500), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint("status IN ('pending', 'approved', 'rejected')", name='ck_coin_request_status'),
            sa.CheckConstraint('amount IS NULL OR amount BETWEEN 50 AND 150', name='ck_coin_request_amount'),
        )
        op.create_index('uq_coin_request_active_work', 'coin_requests', ['worker_id', 'dedup_key'], unique=True,
            postgresql_where=sa.text("status IN ('pending', 'approved')"),
            sqlite_where=sa.text("status IN ('pending', 'approved')"))
        for column in ('worker_id', 'contractor_id', 'created_at'):
            op.create_index(f'ix_coin_requests_{column}', 'coin_requests', [column])
    if 'coin_transactions' not in tables:
        op.create_table('coin_transactions',
            sa.Column('id', sa.String(80), primary_key=True),
            sa.Column('worker_id', sa.String(80), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('event_key', sa.String(100), nullable=False),
            sa.Column('kind', sa.String(20), nullable=False),
            sa.Column('amount', sa.Integer(), nullable=False),
            sa.Column('description', sa.String(240), nullable=False),
            sa.Column('request_id', sa.String(80), sa.ForeignKey('coin_requests.id'), unique=True, nullable=True),
            sa.Column('product_id', sa.String(50), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint('worker_id', 'event_key', name='uq_coin_transaction_event'),
            sa.CheckConstraint('amount <> 0', name='ck_coin_transaction_nonzero'),
        )
        for column in ('worker_id', 'created_at'):
            op.create_index(f'ix_coin_transactions_{column}', 'coin_transactions', [column])
    # Existing accounts get no retroactive welcome payment or imported demo balance.


def downgrade():
    op.drop_table('coin_transactions')
    op.drop_table('coin_requests')
