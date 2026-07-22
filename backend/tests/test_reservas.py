"""Tests del ABM de reservas (RF-03/06): validaciones, montos, seña, estados y PDF."""

from decimal import Decimal

from tests.conftest import crear_departamento, crear_reserva, payload_reserva


def test_crear_reserva_usd(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500", moneda="USD")
    assert Decimal(r["monto_usd"]) == Decimal("500.00")
    assert Decimal(r["monto_pesos"]) == Decimal("500000.00")  # 500 × 1000
    assert r["estado"] == "PENDIENTE"
    assert Decimal(r["saldo_usd"]) == Decimal("500.00")
    assert r["departamento_nombre"] == d["nombre"]


def test_crear_reserva_ars_convierte_a_usd(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500000", moneda="ARS")
    assert Decimal(r["monto_usd"]) == Decimal("500.00")
    assert Decimal(r["monto_pesos"]) == Decimal("500000.00")


def test_fechas_invertidas_422(client, op_headers):
    d = crear_departamento(client, op_headers)
    p = payload_reserva(d["id"])
    p["fecha_ingreso"], p["fecha_egreso"] = p["fecha_egreso"], p["fecha_ingreso"]
    assert client.post("/reservas", json=p, headers=op_headers).status_code == 422


def test_monto_negativo_422(client, op_headers):
    d = crear_departamento(client, op_headers)
    p = payload_reserva(d["id"], monto="-100")
    assert client.post("/reservas", json=p, headers=op_headers).status_code == 422


def test_solapamiento_409(client, op_headers):
    d = crear_departamento(client, op_headers)
    crear_reserva(client, op_headers, d["id"], dias_desde_hoy=10, noches=5)  # días 10→15
    p = payload_reserva(d["id"], dias_desde_hoy=12, noches=5)  # 12→17 pisa 10→15
    r = client.post("/reservas", json=p, headers=op_headers)
    assert r.status_code == 409
    assert "reserva" in r.json()["detail"].lower()


def test_fechas_consecutivas_permitidas(client, op_headers):
    """El egreso de una y el ingreso de otra pueden ser el mismo día."""
    d = crear_departamento(client, op_headers)
    crear_reserva(client, op_headers, d["id"], dias_desde_hoy=10, noches=5)  # 10→15
    r = crear_reserva(client, op_headers, d["id"], dias_desde_hoy=15, noches=3)  # 15→18
    assert r["estado"] == "PENDIENTE"


def test_solapamiento_con_cancelada_permitido(client, op_headers):
    d = crear_departamento(client, op_headers)
    r1 = crear_reserva(client, op_headers, d["id"], dias_desde_hoy=10, noches=5)
    client.patch(f"/reservas/{r1['id']}/cancelar", headers=op_headers)
    r2 = crear_reserva(client, op_headers, d["id"], dias_desde_hoy=10, noches=5)
    assert r2["estado"] == "PENDIENTE"


def test_depto_inactivo_409(client, op_headers):
    d = crear_departamento(client, op_headers)
    client.patch(f"/departamentos/{d['id']}/estado", json={"activo": False}, headers=op_headers)
    r = client.post("/reservas", json=payload_reserva(d["id"]), headers=op_headers)
    assert r.status_code == 409


def test_depto_ajeno_404(client, op_headers, otro_headers):
    d = crear_departamento(client, otro_headers)
    r = client.post("/reservas", json=payload_reserva(d["id"]), headers=op_headers)
    assert r.status_code == 404


# --- Seña ---

def test_sena_parcial_crea_pago_y_estado_parcial(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(
        client, op_headers, d["id"], monto="500", moneda="USD",
        sena="100", sena_moneda="USD", sena_medio_pago="Efectivo",
    )
    assert r["estado"] == "PARCIAL"
    assert Decimal(r["total_pagado_usd"]) == Decimal("100.00")
    assert Decimal(r["saldo_usd"]) == Decimal("400.00")

    pagos = client.get(f"/reservas/{r['id']}/pagos", headers=op_headers).json()
    assert len(pagos) == 1
    assert pagos[0]["concepto"] == "Seña"
    assert pagos[0]["tipo"] == "PAGO"


def test_sena_en_ars_convierte(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(
        client, op_headers, d["id"], monto="500", moneda="USD",
        sena="100000", sena_moneda="ARS",  # 100000/1000 = 100 USD
    )
    assert Decimal(r["total_pagado_usd"]) == Decimal("100.00")
    assert Decimal(r["saldo_usd"]) == Decimal("400.00")


def test_sena_total_estado_pagado(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500", sena="500", sena_moneda="USD")
    assert r["estado"] == "PAGADO"
    assert Decimal(r["saldo_usd"]) == Decimal("0.00")


def test_sena_mayor_al_total_422(client, op_headers):
    d = crear_departamento(client, op_headers)
    p = payload_reserva(d["id"], monto="500", sena="600", sena_moneda="USD")
    assert client.post("/reservas", json=p, headers=op_headers).status_code == 422


# --- Descuentos ---

def test_descuento_porcentaje(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(
        client, op_headers, d["id"], monto="500",
        descuento_tipo="PORCENTAJE", descuento_valor="10",
    )
    assert Decimal(r["descuento_usd"]) == Decimal("50.00")
    assert Decimal(r["total_usd"]) == Decimal("450.00")


def test_descuento_monto_usd(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(
        client, op_headers, d["id"], monto="500",
        descuento_tipo="MONTO", descuento_valor="80",
    )
    assert Decimal(r["total_usd"]) == Decimal("420.00")


def test_descuento_porcentaje_mayor_100_422(client, op_headers):
    d = crear_departamento(client, op_headers)
    p = payload_reserva(d["id"], descuento_tipo="PORCENTAJE", descuento_valor="120")
    assert client.post("/reservas", json=p, headers=op_headers).status_code == 422


def test_descuento_monto_mayor_al_total_422(client, op_headers):
    d = crear_departamento(client, op_headers)
    p = payload_reserva(d["id"], monto="500", descuento_tipo="MONTO", descuento_valor="600")
    assert client.post("/reservas", json=p, headers=op_headers).status_code == 422


def test_descuento_sin_valor_422(client, op_headers):
    d = crear_departamento(client, op_headers)
    p = payload_reserva(d["id"], descuento_tipo="PORCENTAJE")
    assert client.post("/reservas", json=p, headers=op_headers).status_code == 422


# --- Listado, edición, cancelación ---

def test_listar_con_filtros(client, op_headers):
    d1 = crear_departamento(client, op_headers, nombre="A")
    d2 = crear_departamento(client, op_headers, nombre="B")
    crear_reserva(client, op_headers, d1["id"], dias_desde_hoy=10, cliente="Ana García")
    crear_reserva(client, op_headers, d2["id"], dias_desde_hoy=30, cliente="Beto López")

    r = client.get("/reservas", params={"q": "ana"}, headers=op_headers).json()
    assert len(r) == 1 and r[0]["cliente"] == "Ana García"

    r = client.get("/reservas", params={"departamento_id": d2["id"]}, headers=op_headers).json()
    assert len(r) == 1 and r[0]["cliente"] == "Beto López"

    r = client.get("/reservas", params={"estado": "PENDIENTE"}, headers=op_headers).json()
    assert len(r) == 2


def test_listado_no_incluye_ajenas(client, op_headers, otro_headers):
    d = crear_departamento(client, otro_headers)
    crear_reserva(client, otro_headers, d["id"])
    assert client.get("/reservas", headers=op_headers).json() == []


def test_obtener_ajena_404(client, op_headers, otro_headers):
    d = crear_departamento(client, otro_headers)
    r = crear_reserva(client, otro_headers, d["id"])
    assert client.get(f"/reservas/{r['id']}", headers=op_headers).status_code == 404


def test_actualizar_reserva(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500")
    p = payload_reserva(d["id"], dias_desde_hoy=20, noches=4, monto="800")
    p["cliente"] = "Cliente Editado"
    resp = client.put(f"/reservas/{r['id']}", json=p, headers=op_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["cliente"] == "Cliente Editado"
    assert Decimal(data["monto_usd"]) == Decimal("800.00")


def test_editar_cancelada_409(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"])
    client.patch(f"/reservas/{r['id']}/cancelar", headers=op_headers)
    resp = client.put(f"/reservas/{r['id']}", json=payload_reserva(d["id"]), headers=op_headers)
    assert resp.status_code == 409


def test_cancelar_y_recancelar(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"])
    resp = client.patch(f"/reservas/{r['id']}/cancelar", headers=op_headers)
    assert resp.status_code == 200 and resp.json()["estado"] == "CANCELADO"
    assert client.patch(f"/reservas/{r['id']}/cancelar", headers=op_headers).status_code == 409


def test_cancelar_con_devolucion_crea_egreso(client, op_headers):
    """Al cancelar indicando devolución, se genera un movimiento EGRESO 'Devolución'."""
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500", sena="150000", sena_moneda="ARS")

    resp = client.patch(
        f"/reservas/{r['id']}/cancelar",
        json={"devolucion_monto": "150000", "devolucion_moneda": "ARS"},
        headers=op_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["estado"] == "CANCELADO"

    movs = client.get("/movimientos", headers=op_headers).json()
    assert len(movs) == 1
    mov = movs[0]
    assert mov["tipo"] == "EGRESO"
    assert mov["categoria"] == "Devolución"
    assert mov["departamento_nombre"] == d["nombre"]
    assert mov["moneda"] == "ARS"
    assert Decimal(mov["monto"]) == Decimal("150000.00")
    assert f"#{r['id']}" in mov["descripcion"]


def test_cancelar_sin_devolucion_no_crea_egreso(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"])
    resp = client.patch(f"/reservas/{r['id']}/cancelar", headers=op_headers)
    assert resp.status_code == 200
    assert client.get("/movimientos", headers=op_headers).json() == []


def test_cancelar_devolucion_monto_invalido_422(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"])
    resp = client.patch(
        f"/reservas/{r['id']}/cancelar",
        json={"devolucion_monto": "-100", "devolucion_moneda": "ARS"},
        headers=op_headers,
    )
    assert resp.status_code == 422


def test_pdf_reserva(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"])
    resp = client.get(f"/reservas/{r['id']}/pdf", headers=op_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"


def test_tipo_cambio_endpoint(client, op_headers):
    r = client.get("/tipo-cambio", headers=op_headers)
    assert r.status_code == 200
    assert r.json()["venta"] == 1000.0
