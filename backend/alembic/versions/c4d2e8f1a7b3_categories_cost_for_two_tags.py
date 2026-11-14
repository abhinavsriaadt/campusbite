"""categories (many-to-many), restaurants.cost_for_two/primary_category_id, menu_items.tags

Revision ID: c4d2e8f1a7b3
Revises: 4fdca2b9900c
Create Date: 2026-11-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c4d2e8f1a7b3'
down_revision: Union[str, None] = '4fdca2b9900c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('categories',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('slug', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('description', sa.String(length=255), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_categories')),
    sa.UniqueConstraint('slug', name=op.f('uq_categories_slug'))
    )
    op.create_table('restaurant_categories',
    sa.Column('restaurant_id', sa.Integer(), nullable=False),
    sa.Column('category_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], name=op.f('fk_restaurant_categories_category_id_categories'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], name=op.f('fk_restaurant_categories_restaurant_id_restaurants'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('restaurant_id', 'category_id', name=op.f('pk_restaurant_categories'))
    )
    op.create_index(op.f('ix_restaurant_categories_category_id'), 'restaurant_categories', ['category_id'], unique=False)

    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.add_column(sa.Column('cost_for_two', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('primary_category_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(batch_op.f('fk_restaurants_primary_category_id_categories'), 'categories', ['primary_category_id'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tags', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
                                      server_default='[]', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.drop_column('tags')
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_restaurants_primary_category_id_categories'), type_='foreignkey')
        batch_op.drop_column('primary_category_id')
        batch_op.drop_column('cost_for_two')
    op.drop_index(op.f('ix_restaurant_categories_category_id'), table_name='restaurant_categories')
    op.drop_table('restaurant_categories')
    op.drop_table('categories')
