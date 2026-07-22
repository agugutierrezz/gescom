"""descuento a nivel reserva; se quita de pagos

Revision ID: d4e9f3a2b8c1
Revises: 11ba21d8f1cc
Create Date: 2026-07-06 22:30:00.000000

El descuento (CU pagos) aplica sobre el TOTAL de la reserva, no sobre un pago
puntual: se mueven `descuento_tipo` (PORCENTAJE/MONTO) y `descuento_valor` de
`pagos` a `reservas`. El total neto y el saldo pendiente se calculan al vuelo,
no se persisten. Si el descuento es MONTO, se expresa en USD.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e9f3a2b8c1"
down_revision: Union[str, None] = "11ba21d8f1cc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


descuentotipo = sa.Enum("PORCENTAJE", "MONTO", name="descuentotipo")


def upgrade() -> None:
    bind = op.get_bind()

    # El tipo ya existe en Postgres (lo creó la migración inicial para pagos).
    descuentotipo.create(bind, checkfirst=True)

    op.add_column("reservas", sa.Column("descuento_tipo", descuentotipo, nullable=True))
    op.add_column("reservas", sa.Column("descuento_valor", sa.Numeric(12, 2), nullable=True))

    op.drop_column("pagos", "descuento_tipo")
    op.drop_column("pagos", "descuento_valor")


def downgrade() -> None:
    op.add_column("pagos", sa.Column("descuento_tipo", descuentotipo, nullable=True))
    op.add_column("pagos", sa.Column("descuento_valor", sa.Numeric(10, 2), nullable=True))

    op.drop_column("reservas", "descuento_valor")
    op.drop_column("reservas", "descuento_tipo")
