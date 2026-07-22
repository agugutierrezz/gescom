"""Tests de cuenta corriente y pagos (CU02, RF-07): saldos, estados, cargos y excedentes."""

from datetime import date
from decimal import Decimal

from app.models.pago import Moneda, Pago, TipoPago
from tests.conftest import HOY, crear_departamento, crear_reserva


def _pago(monto, moneda="USD", **extra):
    return {"fecha_pago": HOY.isoformat(), "monto": str(monto), "moneda": moneda, **extra}


def test_pago_parcial_estado_parcial(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500")
    resp = client.post(f"/reservas/{r['id']}/pagos", json=_pago(200), headers=op_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["estado"] == "PARCIAL"
    assert Decimal(data["saldo_usd"]) == Decimal("300.00")


def test_pago_total_estado_pagado(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500")
    data = client.post(f"/reservas/{r['id']}/pagos", json=_pago(500), headers=op_headers).json()
    assert data["estado"] == "PAGADO"
    assert Decimal(data["saldo_usd"]) == Decimal("0.00")


def test_pago_en_ars_convierte_con_tc_de_la_reserva(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500")
    data = client.post(
        f"/reservas/{r['id']}/pagos", json=_pago(150000, moneda="ARS"), headers=op_headers
    ).json()  # 150000 / 1000 = 150 USD
    assert Decimal(data["total_pagado_usd"]) == Decimal("150.00")
    assert Decimal(data["saldo_usd"]) == Decimal("350.00")


def test_pago_excedente_409_y_confirmacion(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500")
    resp = client.post(f"/reservas/{r['id']}/pagos", json=_pago(600), headers=op_headers)
    assert resp.status_code == 409
    assert "EXCEDENTE" in resp.json()["detail"]
    # con confirmación explícita se acepta
    resp = client.post(
        f"/reservas/{r['id']}/pagos",
        json=_pago(600, permitir_excedente=True),
        headers=op_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["estado"] == "PAGADO"


def test_pago_sobre_cancelada_409(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"])
    client.patch(f"/reservas/{r['id']}/cancelar", headers=op_headers)
    assert client.post(
        f"/reservas/{r['id']}/pagos", json=_pago(100), headers=op_headers
    ).status_code == 409


def test_pago_sin_saldo_pendiente_409(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500", sena="500", sena_moneda="USD")
    assert client.post(
        f"/reservas/{r['id']}/pagos", json=_pago(100), headers=op_headers
    ).status_code == 409


def test_pago_monto_invalido_422(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"])
    assert client.post(
        f"/reservas/{r['id']}/pagos", json=_pago(0), headers=op_headers
    ).status_code == 422


def test_pago_reserva_ajena_404(client, op_headers, otro_headers):
    d = crear_departamento(client, otro_headers)
    r = crear_reserva(client, otro_headers, d["id"])
    assert client.post(
        f"/reservas/{r['id']}/pagos", json=_pago(100), headers=op_headers
    ).status_code == 404


def test_listar_pagos_ordenados(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500")
    client.post(f"/reservas/{r['id']}/pagos", json=_pago(100, concepto="Cuota 1"), headers=op_headers)
    client.post(f"/reservas/{r['id']}/pagos", json=_pago(50, concepto="Cuota 2"), headers=op_headers)
    pagos = client.get(f"/reservas/{r['id']}/pagos", headers=op_headers).json()
    assert [p["concepto"] for p in pagos] == ["Cuota 1", "Cuota 2"]


def test_eliminar_pago_recalcula_estado(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500")
    data = client.post(f"/reservas/{r['id']}/pagos", json=_pago(500), headers=op_headers).json()
    assert data["estado"] == "PAGADO"
    pago_id = client.get(f"/reservas/{r['id']}/pagos", headers=op_headers).json()[0]["id"]
    data = client.delete(f"/reservas/{r['id']}/pagos/{pago_id}", headers=op_headers).json()
    assert data["estado"] == "PENDIENTE"
    assert Decimal(data["saldo_usd"]) == Decimal("500.00")


def test_eliminar_pago_inexistente_404(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"])
    assert client.delete(f"/reservas/{r['id']}/pagos/999", headers=op_headers).status_code == 404


def test_cargo_sube_el_total_y_el_saldo(client, db, op_headers):
    """RF-07: un CARGO (ej. desayuno) aumenta el total neto y reabre el saldo."""
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500", sena="500", sena_moneda="USD")
    assert r["estado"] == "PAGADO"

    db.add(
        Pago(
            id_reserva=r["id"],
            tipo=TipoPago.CARGO,
            concepto="Desayuno",
            fecha_pago=date.today(),
            monto_original=Decimal("30"),
            moneda=Moneda.USD,
            monto_final=Decimal("30"),
        )
    )
    db.commit()

    data = client.get(f"/reservas/{r['id']}", headers=op_headers).json()
    assert Decimal(data["total_usd"]) == Decimal("530.00")
    assert Decimal(data["saldo_usd"]) == Decimal("30.00")

    # el cargo se salda con un pago y vuelve a PAGADO
    data = client.post(f"/reservas/{r['id']}/pagos", json=_pago(30), headers=op_headers).json()
    assert data["estado"] == "PAGADO"
