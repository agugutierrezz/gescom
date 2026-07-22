"""Levanta el backend para las pruebas E2E con una base de datos aislada.

Usa E2E_DATABASE_URL si está definida; si no, toma DATABASE_URL (del entorno o
de backend/.env) y reemplaza el nombre de la base por `gescom_e2e`, creándola
si no existe. Nunca toca la base real.

Siembra los datos mínimos: usuario `e2e` / `e2e12345` con un departamento.
Lo invoca Playwright automáticamente (ver frontend/playwright.config.js).
"""

import os
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))

E2E_DB_NAME = "gescom_e2e"
PUERTO = 8001


def _leer_env_file() -> dict:
    env = {}
    archivo = BASE / ".env"
    if archivo.exists():
        for linea in archivo.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if "=" in linea and not linea.startswith("#"):
                clave, valor = linea.split("=", 1)
                env[clave.strip()] = valor.strip().strip('"').strip("'")
    return env


def url_e2e() -> str:
    if os.environ.get("E2E_DATABASE_URL"):
        return os.environ["E2E_DATABASE_URL"]
    base_url = os.environ.get("DATABASE_URL") or _leer_env_file().get("DATABASE_URL")
    if not base_url:
        raise SystemExit("Definí DATABASE_URL (en backend/.env) o E2E_DATABASE_URL")
    from sqlalchemy.engine import make_url

    return str(make_url(base_url).set(database=E2E_DB_NAME))


AYUDA = f"""
[e2e] No se pudo conectar/crear la base de datos E2E.
      (Si viste un UnicodeDecodeError, es psycopg2 fallando al decodificar el
      mensaje de error en español de Postgres en Windows; la causa real suele
      ser de credenciales o de una base inexistente.)

      Solución rápida (una sola vez):
        psql -U postgres -c "CREATE DATABASE {E2E_DB_NAME}"

      Y si las credenciales del backend/.env no sirven, definí la URL completa:
        PowerShell:  $env:E2E_DATABASE_URL = "postgresql://postgres:TU_PASSWORD@localhost:5432/{E2E_DB_NAME}"
"""


def _conecta(url: str) -> bool:
    """True si se puede conectar a la URL. Nunca lanza (evita el UnicodeDecodeError
    de psycopg2 con mensajes de error localizados en Windows)."""
    from sqlalchemy import create_engine, text

    try:
        eng = create_engine(url)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        eng.dispose()
        return True
    except Exception:
        return False


def crear_db_si_falta(url: str) -> None:
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url

    if _conecta(url):  # la base ya existe y las credenciales sirven
        return

    u = make_url(url)
    try:
        admin = create_engine(str(u.set(database="postgres")), isolation_level="AUTOCOMMIT")
        with admin.connect() as conn:
            existe = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": u.database}
            ).scalar()
            if not existe:
                conn.execute(text(f'CREATE DATABASE "{u.database}"'))
        admin.dispose()
    except SystemExit:
        raise
    except UnicodeDecodeError:
        raise SystemExit(AYUDA)
    except Exception as e:
        raise SystemExit(f"[e2e] Error preparando la base: {e}\n{AYUDA}")

    if not _conecta(url):
        raise SystemExit(AYUDA)


def main() -> None:
    url = url_e2e()
    crear_db_si_falta(url)
    os.environ["DATABASE_URL"] = url
    os.environ.setdefault("SECRET_KEY", "clave-solo-para-e2e")

    import app.models  # noqa: F401  (registra los modelos)
    from sqlalchemy import text

    from app.core.security import hash_password
    from app.db.session import Base, SessionLocal, engine
    from app.models.departamento import Departamento
    from app.models.usuario import RolUsuario, Usuario

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        tablas = ", ".join(t.name for t in Base.metadata.sorted_tables)
        conn.execute(text(f"TRUNCATE {tablas} RESTART IDENTITY CASCADE"))

    db = SessionLocal()
    operador = Usuario(
        nombre="e2e", hashed_password=hash_password("e2e12345"), rol=RolUsuario.OPERADOR
    )
    db.add(operador)
    db.flush()
    db.add(
        Departamento(
            id_usuario=operador.id,
            nombre="Depto E2E",
            descripcion="Departamento para pruebas E2E",
            capacidad_maxima=4,
            activo=True,
        )
    )
    db.commit()
    db.close()
    print(f"[e2e] Backend en http://127.0.0.1:{PUERTO} — DB: {url}")

    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=PUERTO, log_level="warning")


if __name__ == "__main__":
    main()
