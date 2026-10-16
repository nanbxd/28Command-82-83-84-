"""Contractor ownership and cleaning runs."""
from alembic import op
import sqlalchemy as sa
revision = 'c28a14f03001'
down_revision = 'fd1b4e2ebab5'
branch_labels = None
depends_on = None


def upgrade():
    for table in ('users', 'projects'):
        op.add_column(table, sa.Column('contractor_id', sa.String(80), nullable=True))
        op.create_foreign_key('fk_' + table + '_contractor', table, 'users', ['contractor_id'], ['id'])
        op.create_index('ix_' + table + '_contractor_id', table, ['contractor_id'])
    op.create_table('cleaning_runs',
        sa.Column('id', sa.String(80), primary_key=True),
        sa.Column('project_id', sa.String(80), sa.ForeignKey('projects.id'), nullable=False, index=True),
        sa.Column('contractor_id', sa.String(80), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('visits', sa.Column('run_id', sa.String(80), nullable=True))
    op.create_foreign_key('fk_visits_run', 'visits', 'cleaning_runs', ['run_id'], ['id'])
    op.create_index('ix_visits_run_id', 'visits', ['run_id'])
    op.add_column('visits', sa.Column('zone', sa.String(200), server_default='', nullable=False))


def downgrade():
    op.drop_column('visits', 'zone')
    op.drop_constraint('fk_visits_run', 'visits', type_='foreignkey')
    op.drop_index('ix_visits_run_id', 'visits')
    op.drop_column('visits', 'run_id')
    op.drop_table('cleaning_runs')
    for table in ('projects', 'users'):
        op.drop_constraint('fk_' + table + '_contractor', table, type_='foreignkey')
        op.drop_index('ix_' + table + '_contractor_id', table)
        op.drop_column(table, 'contractor_id')
