"""Tests del calendario de disponibilidad exportado a PDF."""

from tests.conftest import HOY, crear_departamento, crear_reserva


def _params(depto_id, **extra):
    return {"departamento_id": depto_id, "anio": HOY.year, "mes": HOY.month, **extra}


def test_pdf_disponibilidad(client, op_headers):
    d = crear_departamento(client, op_headers)
    crear_reserva(client, op_headers, d["id"])
    r = client.get("/disponibilidad/pdf", params=_params(d["id"]), headers=op_headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"


def test_pdf_sin_reservas(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = client.get("/disponibilidad/pdf", params=_params(d["id"]), headers=op_headers)
    assert r.status_code == 200


def test_departamento_ajeno_404(client, op_headers, otro_headers):
    d = crear_departamento(client, otro_headers)
    r = client.get("/disponibilidad/pdf", params=_params(d["id"]), headers=op_headers)
    assert r.status_code == 404


def test_mes_invalido_422(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = client.get("/disponibilidad/pdf", params=_params(d["id"], mes=13), headers=op_headers)
    assert r.status_code == 422


def test_sin_token_401(client):
    assert client.get("/disponibilidad/pdf", params={"departamento_id": 1, "anio": 2026, "mes": 1}).status_code == 401
