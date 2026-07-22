"""Tests del ABM de movimientos operativos (RF-15) y consulta histórica (RF-16)."""

from datetime import timedelta

from tests.conftest import HOY, crear_departamento


def _mov(descripcion="Compra sábanas", tipo="EGRESO", monto="15000", **extra):
    return {
        "fecha": HOY.isoformat(),
        "descripcion": descripcion,
        "tipo": tipo,
        "monto": monto,
        "moneda": "ARS",
        **extra,
    }


def crear_mov(client, headers, **kwargs):
    r = client.post("/movimientos", json=_mov(**kwargs), headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_crear_egreso(client, op_headers):
    m = crear_mov(client, op_headers, categoria="Blanquería")
    assert m["tipo"] == "EGRESO"
    assert m["categoria"] == "Blanquería"
    assert m["departamento_nombre"] is None


def test_crear_ingreso_con_departamento(client, op_headers):
    d = crear_departamento(client, op_headers, nombre="Cabaña 1")
    m = crear_mov(
        client, op_headers, descripcion="Alquiler cochera", tipo="INGRESO",
        id_departamento=d["id"],
    )
    assert m["departamento_nombre"] == "Cabaña 1"


def test_departamento_ajeno_404(client, op_headers, otro_headers):
    d = crear_departamento(client, otro_headers)
    r = client.post("/movimientos", json=_mov(id_departamento=d["id"]), headers=op_headers)
    assert r.status_code == 404


def test_monto_invalido_422(client, op_headers):
    assert client.post("/movimientos", json=_mov(monto="0"), headers=op_headers).status_code == 422


def test_listar_filtros(client, op_headers):
    crear_mov(client, op_headers, descripcion="Sueldo limpieza", tipo="EGRESO", categoria="Personal")
    crear_mov(client, op_headers, descripcion="Venta leña", tipo="INGRESO", categoria="Extras")

    r = client.get("/movimientos", params={"tipo": "INGRESO"}, headers=op_headers).json()
    assert len(r) == 1 and r[0]["descripcion"] == "Venta leña"

    r = client.get("/movimientos", params={"q": "sueldo"}, headers=op_headers).json()
    assert len(r) == 1

    r = client.get("/movimientos", params={"categoria": "personal"}, headers=op_headers).json()
    assert len(r) == 1  # case-insensitive

    manana = (HOY + timedelta(days=1)).isoformat()
    r = client.get("/movimientos", params={"fecha_desde": manana}, headers=op_headers).json()
    assert r == []


def test_listar_solo_propios(client, op_headers, otro_headers):
    crear_mov(client, otro_headers)
    assert client.get("/movimientos", headers=op_headers).json() == []


def test_categorias_distintas(client, op_headers):
    crear_mov(client, op_headers, categoria="Limpieza")
    crear_mov(client, op_headers, descripcion="Otra", categoria="Limpieza")
    crear_mov(client, op_headers, descripcion="Más", categoria="Admin")
    assert client.get("/movimientos/categorias", headers=op_headers).json() == ["Admin", "Limpieza"]


def test_actualizar_movimiento(client, op_headers):
    m = crear_mov(client, op_headers)
    r = client.put(
        f"/movimientos/{m['id']}",
        json=_mov(descripcion="Editado", tipo="INGRESO", monto="99"),
        headers=op_headers,
    )
    assert r.status_code == 200
    assert r.json()["descripcion"] == "Editado"
    assert r.json()["tipo"] == "INGRESO"


def test_actualizar_ajeno_404(client, op_headers, otro_headers):
    m = crear_mov(client, otro_headers)
    r = client.put(f"/movimientos/{m['id']}", json=_mov(), headers=op_headers)
    assert r.status_code == 404


def test_eliminar_movimiento(client, op_headers):
    m = crear_mov(client, op_headers)
    assert client.delete(f"/movimientos/{m['id']}", headers=op_headers).status_code == 204
    assert client.get("/movimientos", headers=op_headers).json() == []


def test_eliminar_ajeno_404(client, op_headers, otro_headers):
    m = crear_mov(client, otro_headers)
    assert client.delete(f"/movimientos/{m['id']}", headers=op_headers).status_code == 404
