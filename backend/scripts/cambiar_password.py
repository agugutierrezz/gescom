"""Cambia la contraseña de un usuario por consola (vía de recuperación del admin).

Uso (desde gescom/backend, con el venv activado):
    python -m scripts.cambiar_password <nombre> <nueva_password>

Ejemplo:
    python -m scripts.cambiar_password admin MiNuevaClaveSegura
"""

import sys
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.usuario import Usuario


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    nombre = sys.argv[1]
    password = sys.argv[2]
    if len(password) < 8:
        print("La contraseña debe tener al menos 8 caracteres")
        sys.exit(1)

    with SessionLocal() as db:
        usuario = db.scalar(select(Usuario).where(Usuario.nombre == nombre))
        if usuario is None:
            print(f"No existe un usuario con nombre '{nombre}'")
            sys.exit(1)

        usuario.hashed_password = hash_password(password)
        usuario.password_changed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        print(f"Contraseña actualizada para '{usuario.nombre}' (rol {usuario.rol.value})")


if __name__ == "__main__":
    main()
