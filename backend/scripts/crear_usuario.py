"""Crea un usuario en la base de datos.

Uso (desde gescom/backend, con el venv activado):
    python -m scripts.crear_usuario <nombre> <password> [ADMIN|OPERADOR]

Ejemplo:
    python -m scripts.crear_usuario puntapiedras MiClaveSegura ADMIN
"""

import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.usuario import RolUsuario, Usuario


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    nombre = sys.argv[1]
    password = sys.argv[2]
    rol = RolUsuario(sys.argv[3].upper()) if len(sys.argv) > 3 else RolUsuario.ADMIN

    with SessionLocal() as db:
        existente = db.scalar(select(Usuario).where(Usuario.nombre == nombre))
        if existente:
            print(f"Ya existe un usuario con nombre '{nombre}' (id={existente.id})")
            sys.exit(1)

        usuario = Usuario(nombre=nombre, hashed_password=hash_password(password), rol=rol)
        db.add(usuario)
        db.commit()
        db.refresh(usuario)
        print(f"Usuario creado: id={usuario.id}, nombre={usuario.nombre}, rol={usuario.rol.value}")


if __name__ == "__main__":
    main()
