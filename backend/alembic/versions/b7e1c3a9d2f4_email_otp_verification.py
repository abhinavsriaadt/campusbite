"""email OTP verification: users.is_verified + otp_codes

Revision ID: b7e1c3a9d2f4
Revises: 4fdca2b9900c
Create Date: 2026-11-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import app.core.database


revision: str = 'b7e1c3a9d2f4'
down_revision: Union[str, None] = '4fdca2b9900c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_verified', sa.Boolean(), server_default=sa.false(), nullable=False))
    # Accounts created before email verification existed (demo data, earlier sign-ups) were
    # already usable; keep them working instead of locking them out.
    op.execute(sa.text("UPDATE users SET is_verified = TRUE"))

    op.create_table('otp_codes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('purpose', sa.String(length=16), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', app.core.database.UTCDateTime(timezone=True), nullable=False),
    sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('consumed_at', app.core.database.UTCDateTime(timezone=True), nullable=True),
    sa.Column('created_at', app.core.database.UTCDateTime(timezone=True), nullable=False),
    sa.CheckConstraint("purpose IN ('signup', 'login')", name=op.f('ck_otp_codes_purpose_valid')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_otp_codes_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_otp_codes'))
    )
    op.create_index('ix_otp_codes_user_purpose_created', 'otp_codes', ['user_id', 'purpose', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_otp_codes_user_purpose_created', table_name='otp_codes')
    op.drop_table('otp_codes')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('is_verified')
