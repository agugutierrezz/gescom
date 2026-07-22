"""Tests de autenticación: login, /auth/me y rate limit de login (RF-01/RF-18)."""

from app.core.config import settings
from tests.conftest import PASSWORD_TESTS, headers_de


def test_login_ok(client, operador):
    r = client.post("/auth/login", json={"nombre": "operador1", "password": PASSWORD_TESTS})
    assert r.status_code == 200
    data = r.json()
    assert data["access_token"]
    assert data["token_type"] == "bearer"
    assert data["user"]["nombre"] == "operador1"
    assert data["user"]["rol"] == "OPERADOR"


def test_login_password_incorrecta(client, operador):
    r = client.post("/auth/login", json={"nombre": "operador1", "password": "incorrecta"})
    assert r.status_code == 401


def test_login_usuario_inexistente(client):
    r = client.post("/auth/login", json={"nombre": "nadie", "password": "loquesea"})
    assert r.status_code == 401


def test_login_usuario_inactivo(client, db, operador):
    operador.activo = False
    db.commit()
    r = client.post("/auth/login", json={"nombre": "operador1", "password": PASSWORD_TESTS})
    assert r.status_code == 403


def test_me_con_token(client, operador):
    r = client.get("/auth/me", headers=headers_de(operador))
    assert r.status_code == 200
    assert r.json()["nombre"] == "operador1"


def test_me_sin_token(client):
    assert client.get("/auth/me").status_code == 401


def test_me_token_invalido(client):
    r = client.get("/auth/me", headers={"Authorization": "Bearer token-falso"})
    assert r.status_code == 401


def test_reset_password_publico_eliminado(client, operador):
    """El endpoint público de reset fue eliminado por seguridad (ver routers/auth.py)."""
    r = client.post(
        "/auth/reset-password", json={"nombre": "operador1", "password": "nuevaclave123"}
    )
    assert r.status_code in (404, 405)


def test_login_rate_limit_bloquea_tras_max_intentos(client, operador):
    for _ in range(settings.LOGIN_MAX_INTENTOS):
        r = client.post("/auth/login", json={"nombre": "operador1", "password": "incorrecta"})
        assert r.status_code == 401
    # Superado el máximo, bloquea incluso con la contraseña correcta
    r = client.post("/auth/login", json={"nombre": "operador1", "password": PASSWORD_TESTS})
    assert r.status_code == 429


def test_login_rate_limit_es_por_usuario(client, operador, admin):
    for _ in range(settings.LOGIN_MAX_INTENTOS):
        client.post("/auth/login", json={"nombre": "operador1", "password": "incorrecta"})
    # Otro usuario no queda bloqueado
    r = client.post("/auth/login", json={"nombre": "admin", "password": PASSWORD_TESTS})
    assert r.status_code == 200


def test_login_exitoso_resetea_contador(client, operador):
    for _ in range(settings.LOGIN_MAX_INTENTOS - 1):
        client.post("/auth/login", json={"nombre": "operador1", "password": "incorrecta"})
    assert client.post(
        "/auth/login", json={"nombre": "operador1", "password": PASSWORD_TESTS}
    ).status_code == 200
    # El login correcto limpió los intentos fallidos: puede fallar de nuevo sin bloquearse
    r = client.post("/auth/login", json={"nombre": "operador1", "password": "incorrecta"})
    assert r.status_code == 401
