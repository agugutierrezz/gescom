"""pago: tipo (CARGO/PAGO) y concepto para gastos adicionales (RF-07)

Revision ID: c3d8e2f0a1b9
Revises: b2f7a1c9d4e0
Create Date: 2026-07-02 12:00:00.000000

Convierte la tabla `pagos` en una cuenta corriente por reserva: cada fila es
un CARGO (el cliente consume/debe: desayuno, limpieza…) o un PAGO (el cliente
entrega plata: seña, cuotas…). Agrega `tipo` y `concepto`, y vuelve opcional
`medio_pago` (un cargo no tiene medio de pago). Las filas existentes se marcan
como PAGO.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d8e2f0a1b9"
down_revision: Union[str, None] = "b2f7a1c9d4e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


tipopago = sa.Enum("CARGO", "PAGO", name="tipopago")


def upgrade() -> None:
    bind = op.get_bind()

    # Tipo enum nuevo en Postgres.
    tipopago.create(bind, checkfirst=True)

    # 1) Columnas nuevas (nullable para poder rellenar las filas existentes).
    op.add_column("pagos", sa.Column("tipo", tipopago, nullable=True))
    op.add_column("pagos", sa.Column("concepto", sa.String(length=255), nullable=True))

    # 2) Todo lo que ya existía era un pago del cliente.
    op.execute("UPDATE pagos SET tipo = 'PAGO' WHERE tipo IS NULL")

    # 3) tipo pasa a obligatorio; medio_pago pasa a opcional (los CARGO no lo usan).
    op.alter_column("pagos", "tipo", existing_type=tipopago, nullable=False)
    op.alter_column("pagos", "medio_pago", existing_type=sa.String(length=50), nullable=True)


def downgrade() -> None:
    op.alter_column("pagos", "medio_pago", existing_type=sa.String(length=50), nullable=False)
    op.drop_column("pagos", "concepto")
    op.drop_column("pagos", "tipo")
    tipopago.drop(op.get_bind(), checkfirst=True)
