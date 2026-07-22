"""multiusuario: id_usuario en departamentos, reservas y movimientos

Revision ID: b2f7a1c9d4e0
Revises: ecd1c25abeb3
Create Date: 2026-07-02 11:00:00.000000

Agrega la columna id_usuario (FK -> usuarios.id, NOT NULL) a las tablas
departamentos, reservas y movimientos para habilitar el aislamiento por
complejo (multiusuario). Los datos existentes se asignan al primer usuario
registrado (el complejo actual).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2f7a1c9d4e0"
down_revision: Union[str, None] = "ecd1c25abeb3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Tablas a las que se les agrega el dueño (id_usuario).
_TABLAS = ("departamentos", "reservas", "movimientos")


def _primer_usuario_id(bind) -> int | None:
    return bind.execute(sa.text("SELECT id FROM usuarios ORDER BY id LIMIT 1")).scalar()


def upgrade() -> None:
    bind = op.get_bind()
    usuario_id = _primer_usuario_id(bind)

    for tabla in _TABLAS:
        # 1) Se agrega como nullable para poder rellenar las filas existentes.
        op.add_column(tabla, sa.Column("id_usuario", sa.Integer(), nullable=True))

        # 2) Backfill: se asigna el dueño a las filas ya cargadas.
        filas = bind.execute(sa.text(f"SELECT COUNT(*) FROM {tabla}")).scalar()
        if filas:
            if usuario_id is None:
                raise RuntimeError(
                    f"No hay usuarios en la tabla 'usuarios', pero '{tabla}' tiene "
                    f"{filas} fila(s). Creá un usuario (scripts/crear_usuario.py) "
                    "antes de correr esta migración."
                )
            op.execute(
                sa.text(f"UPDATE {tabla} SET id_usuario = :uid WHERE id_usuario IS NULL")
                .bindparams(uid=usuario_id)
            )

        # 3) Ahora sí, NOT NULL + índice + FK.
        op.alter_column(tabla, "id_usuario", existing_type=sa.Integer(), nullable=False)
        op.create_index(op.f(f"ix_{tabla}_id_usuario"), tabla, ["id_usuario"], unique=False)
        op.create_foreign_key(
            f"fk_{tabla}_id_usuario_usuarios", tabla, "usuarios", ["id_usuario"], ["id"]
        )


def downgrade() -> None:
    for tabla in _TABLAS:
        op.drop_constraint(f"fk_{tabla}_id_usuario_usuarios", tabla, type_="foreignkey")
        op.drop_index(op.f(f"ix_{tabla}_id_usuario"), table_name=tabla)
        op.drop_column(tabla, "id_usuario")
