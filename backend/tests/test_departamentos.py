"""Tests del ABM de departamentos (RF-02): alta, baja lógica, modificación y listado."""

from tests.conftest import crear_departamento


def test_crear_departamento(client, op_headers):
    d = crear_departamento(client, op_headers, nombre="Cabaña 1", capacidad=6)
    assert d["nombre"] == "Cabaña 1"
    assert d["capacidad_maxima"] == 6
    assert d["activo"] is True


def test_crear_nombre_duplicado_409(client, op_headers):
    crear_departamento(client, op_headers, nombre="Cabaña 1")
    r = client.post(
        "/departamentos",
        json={"nombre": "  cabaña 1 ", "descripcion": None, "capacidad_maxima": 2},
        headers=op_headers,
    )
    assert r.status_code == 409  # único por usuario, case-insensitive y sin espacios


def test_mismo_nombre_en_otro_usuario_permitido(client, op_headers, otro_headers):
    crear_departamento(client, op_headers, nombre="Cabaña 1")
    d = crear_departamento(client, otro_headers, nombre="Cabaña 1")
    assert d["nombre"] == "Cabaña 1"


def test_capacidad_invalida_422(client, op_headers):
    for cap in (0, 51):
        r = client.post(
            "/departamentos",
            json={"nombre": f"X{cap}", "descripcion": None, "capacidad_maxima": cap},
            headers=op_headers,
        )
        assert r.status_code == 422


def test_listar_solo_propios(client, op_headers, otro_headers):
    crear_departamento(client, op_headers, nombre="Mío")
    crear_departamento(client, otro_headers, nombre="Ajeno")
    nombres = [d["nombre"] for d in client.get("/departamentos", headers=op_headers).json()]
    assert nombres == ["Mío"]


def test_listar_filtros(client, op_headers):
    crear_departamento(client, op_headers, nombre="Cabaña Norte")
    d2 = crear_departamento(client, op_headers, nombre="Cabaña Sur")
    crear_departamento(client, op_headers, nombre="Loft")
    client.patch(f"/departamentos/{d2['id']}/estado", json={"activo": False}, headers=op_headers)

    r = client.get("/departamentos", params={"q": "cabaña"}, headers=op_headers)
    assert [d["nombre"] for d in r.json()] == ["Cabaña Norte", "Cabaña Sur"]

    r = client.get("/departamentos", params={"activo": True}, headers=op_headers)
    assert [d["nombre"] for d in r.json()] == ["Cabaña Norte", "Loft"]


def test_obtener_ajeno_404(client, op_headers, otro_headers):
    d = crear_departamento(client, otro_headers)
    assert client.get(f"/departamentos/{d['id']}", headers=op_headers).status_code == 404


def test_actualizar_departamento(client, op_headers):
    d = crear_departamento(client, op_headers, nombre="Viejo")
    r = client.put(
        f"/departamentos/{d['id']}",
        json={"nombre": "Nuevo", "descripcion": "Renovado", "capacidad_maxima": 8},
        headers=op_headers,
    )
    assert r.status_code == 200
    assert r.json()["nombre"] == "Nuevo"
    assert r.json()["capacidad_maxima"] == 8


def test_actualizar_a_nombre_duplicado_409(client, op_headers):
    crear_departamento(client, op_headers, nombre="A")
    d = crear_departamento(client, op_headers, nombre="B")
    r = client.put(
        f"/departamentos/{d['id']}",
        json={"nombre": "A", "descripcion": None, "capacidad_maxima": 4},
        headers=op_headers,
    )
    assert r.status_code == 409


def test_baja_y_alta_logica(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = client.patch(f"/departamentos/{d['id']}/estado", json={"activo": False}, headers=op_headers)
    assert r.status_code == 200 and r.json()["activo"] is False
    r = client.patch(f"/departamentos/{d['id']}/estado", json={"activo": True}, headers=op_headers)
    assert r.status_code == 200 and r.json()["activo"] is True


def test_sin_token_401(client):
    assert client.get("/departamentos").status_code == 401
