"""Organizations, objects and planned/actual work records."""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("organizations",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(240), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
    )
    op.create_table("service_objects",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("organization_id", sa.String(80), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(240), nullable=False),
        sa.Column("scope", sa.String(500), nullable=False),
        sa.Column("city", sa.String(120), nullable=False),
        sa.Column("area_sqm", sa.Integer(), nullable=False),
        sa.Column("contract_number", sa.String(120), nullable=False),
        sa.Column("contract_status", sa.String(80), nullable=False),
    )
    op.create_index("ix_service_objects_organization_id", "service_objects", ["organization_id"])
    op.create_table("work_shifts",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("organization_id", sa.String(80), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("object_id", sa.String(80), sa.ForeignKey("service_objects.id"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("role", sa.String(300), nullable=False),
        sa.Column("planned_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("planned_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actual_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checklist_recorded", sa.Boolean(), nullable=False),
        sa.Column("plan_row", sa.Integer(), nullable=False),
        sa.Column("fact_row", sa.Integer(), nullable=True),
    )
    op.create_index("ix_shift_organization_date", "work_shifts", ["organization_id", "work_date"])


def downgrade():
    op.drop_table("work_shifts")
    op.drop_table("service_objects")
    op.drop_table("organizations")
