"""Tests del panel de administración de usuarios (RF-18): exclusivo del ADMIN."""

from tests.conftest import PASSWORD_TESTS, crear_departamento, crear_reserva, headers_de


def test_listar_como_admin(client, admin_headers, operador):
    r = client.get("/usuarios", headers=admin_headers)
    assert r.status_code == 200
    nombres = [u["nombre"] for u in r.json()]
    assert "admin" in nombres and "operador1" in nombres


def test_listar_como_operador_403(client, op_headers):
    assert client.get("/usuarios", headers=op_headers).status_code == 403


def test_crear_operador(client, admin_headers):
    r = client.post(
        "/usuarios", json={"nombre": "complejo.sur", "password": "clave12345"}, headers=admin_headers
    )
    assert r.status_code == 201
    data = r.json()
    assert data["rol"] == "OPERADOR"  # siempre OPERADOR, hay un único ADMIN
    assert data["activo"] is True
    # puede loguearse
    assert client.post(
        "/auth/login", json={"nombre": "complejo.sur", "password": "clave12345"}
    ).status_code == 200


def test_crear_nombre_duplicado_409(client, admin_headers, operador):
    r = client.post(
        "/usuarios", json={"nombre": "operador1", "password": "clave12345"}, headers=admin_headers
    )
    assert r.status_code == 409


def test_crear_datos_invalidos_422(client, admin_headers):
    # password corta
    assert client.post(
        "/usuarios", json={"nombre": "valido", "password": "corta"}, headers=admin_headers
    ).status_code == 422
    # nombre con caracteres inválidos
    assert client.post(
        "/usuarios", json={"nombre": "con espacios!", "password": "clave12345"}, headers=admin_headers
    ).status_code == 422


def test_crear_como_operador_403(client, op_headers):
    r = client.post(
        "/usuarios", json={"nombre": "intruso", "password": "clave12345"}, headers=op_headers
    )
    assert r.status_code == 403


def test_renombrar_usuario(client, admin_headers, operador):
    r = client.put(
        f"/usuarios/{operador.id}", json={"nombre": "renombrado"}, headers=admin_headers
    )
    assert r.status_code == 200 and r.json()["nombre"] == "renombrado"
    # el login pasa a ser con el nombre nuevo
    assert client.post(
        "/auth/login", json={"nombre": "renombrado", "password": PASSWORD_TESTS}
    ).status_code == 200


def test_renombrar_a_existente_409(client, admin_headers, operador, otro_operador):
    r = client.put(
        f"/usuarios/{operador.id}", json={"nombre": "operador2"}, headers=admin_headers
    )
    assert r.status_code == 409


def test_desactivar_bloquea_login_y_token(client, admin_headers, operador):
    op_headers = headers_de(operador)
    r = client.patch(
        f"/usuarios/{operador.id}/estado", json={"activo": False}, headers=admin_headers
    )
    assert r.status_code == 200 and r.json()["activo"] is False
    # no puede loguearse ni usar un token vigente
    assert client.post(
        "/auth/login", json={"nombre": "operador1", "password": PASSWORD_TESTS}
    ).status_code == 403
    assert client.get("/auth/me", headers=op_headers).status_code == 401
    # reactivación
    client.patch(f"/usuarios/{operador.id}/estado", json={"activo": True}, headers=admin_headers)
    assert client.get("/auth/me", headers=op_headers).status_code == 200


def test_admin_no_puede_autodesactivarse(client, admin, admin_headers):
    r = client.patch(
        f"/usuarios/{admin.id}/estado", json={"activo": False}, headers=admin_headers
    )
    assert r.status_code == 409


def test_contadores_de_actividad(client, admin_headers, operador):
    op_headers = headers_de(operador)
    d = crear_departamento(client, op_headers)
    crear_reserva(client, op_headers, d["id"])
    fila = next(
        u for u in client.get("/usuarios", headers=admin_headers).json()
        if u["nombre"] == "operador1"
    )
    assert fila["cant_departamentos"] == 1
    assert fila["cant_reservas"] == 1
