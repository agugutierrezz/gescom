"""Infraestructura de tests: DB Postgres de test, usuarios, auth y mock de dolarapi.

IMPORTANTE: se fuerza DATABASE_URL a la base de test ANTES de importar la app,
para que ningún test toque la base real. Configurable vía TEST_DATABASE_URL.
"""

import os

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/gescom_test",
)
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ.setdefault("SECRET_KEY", "clave-secreta-solo-para-tests")

from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app.models  # noqa: F401  (registra todos los modelos en Base.metadata)
from app.core.security import create_access_token, hash_password
from app.db.session import Base, SessionLocal, engine
from app.main import app as fastapi_app
from app.models.usuario import RolUsuario, Usuario

# Cotización fija para todos los tests (mock de dolarapi.com)
COTIZACION_MOCK = {
    "casa": "oficial",
    "nombre": "Oficial",
    "compra": 990.0,
    "venta": 1000.0,
    "fecha_actualizacion": "2026-07-21T10:00:00.000Z",
}
TC = Decimal("1000")  # tipo de cambio "venta" usado en los tests

HOY = date.today()
PASSWORD_TESTS = "password123"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    """Crea el esquema completo en la DB de test una vez por corrida."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _db_limpia():
    """Trunca todas las tablas al final de cada test (aislamiento total)."""
    yield
    with engine.begin() as conn:
        tablas = ", ".join(t.name for t in Base.metadata.sorted_tables)
        conn.execute(text(f"TRUNCATE {tablas} RESTART IDENTITY CASCADE"))


@pytest.fixture(autouse=True)
def _rate_limit_limpio():
    """Resetea el rate limit de login entre tests (estado en memoria)."""
    from app.routers.auth import limpiar_intentos_login

    limpiar_intentos_login()
    yield
    limpiar_intentos_login()


@pytest.fixture(autouse=True)
def mock_dolarapi(monkeypatch):
    """Evita llamadas reales a dolarapi.com en todos los puntos donde se importó."""
    from app.routers import reservas as reservas_router
    from app.services import finanzas as finanzas_service
    from app.services import tipo_cambio as tc_service

    monkeypatch.setattr(tc_service, "obtener_cotizacion", lambda: COTIZACION_MOCK)
    monkeypatch.setattr(reservas_router, "obtener_cotizacion", lambda: COTIZACION_MOCK)
    monkeypatch.setattr(finanzas_service, "obtener_cotizacion", lambda: COTIZACION_MOCK)
    yield


@pytest.fixture()
def client():
    return TestClient(fastapi_app)


@pytest.fixture()
def db():
    sesion = SessionLocal()
    yield sesion
    sesion.close()


# ---------------------------------------------------------------------------
# Usuarios y auth
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def hash_comun():
    """bcrypt es lento: un solo hash reutilizado por todos los usuarios de test."""
    return hash_password(PASSWORD_TESTS)


def _crear_usuario(db, hash_comun, nombre, rol=RolUsuario.OPERADOR, activo=True):
    usuario = Usuario(nombre=nombre, hashed_password=hash_comun, rol=rol, activo=activo)
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@pytest.fixture()
def admin(db, hash_comun):
    return _crear_usuario(db, hash_comun, "admin", rol=RolUsuario.ADMIN)


@pytest.fixture()
def operador(db, hash_comun):
    return _crear_usuario(db, hash_comun, "operador1")


@pytest.fixture()
def otro_operador(db, hash_comun):
    return _crear_usuario(db, hash_comun, "operador2")


def headers_de(usuario: Usuario) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(usuario.id))}"}


@pytest.fixture()
def admin_headers(admin):
    return headers_de(admin)


@pytest.fixture()
def op_headers(operador):
    return headers_de(operador)


@pytest.fixture()
def otro_headers(otro_operador):
    return headers_de(otro_operador)


# ---------------------------------------------------------------------------
# Helpers de datos
# ---------------------------------------------------------------------------

def crear_departamento(client, headers, nombre="Depto A", capacidad=4, **extra):
    r = client.post(
        "/departamentos",
        json={"nombre": nombre, "descripcion": None, "capacidad_maxima": capacidad, **extra},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def payload_reserva(depto_id, dias_desde_hoy=10, noches=5, monto="500", moneda="USD", **extra):
    ingreso = HOY + timedelta(days=dias_desde_hoy)
    egreso = ingreso + timedelta(days=noches)
    return {
        "cliente": "Juan Pérez",
        "id_departamento": depto_id,
        "fecha_ingreso": ingreso.isoformat(),
        "fecha_egreso": egreso.isoformat(),
        "monto": monto,
        "moneda": moneda,
        "tipo_cambio": str(TC),
        **extra,
    }


def crear_reserva(client, headers, depto_id, **extra):
    r = client.post("/reservas", json=payload_reserva(depto_id, **extra), headers=headers)
    assert r.status_code == 201, r.text
    return r.json()
