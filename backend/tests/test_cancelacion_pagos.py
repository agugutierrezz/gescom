"""Cancelación: qué pasa con la plata (retener / devolver / anular por error de carga)."""

from tests.conftest import crear_departamento, crear_reserva


def _cobros_en_finanzas(client, headers) -> int:
    r = client.get("/finanzas/transacciones", headers=headers)
    assert r.status_code == 200, r.text
    return str(r.json()).count("PAGO_RESERVA")


def _reserva_con_sena(client, headers):
    d = crear_departamento(client, headers)
    return crear_reserva(client, headers, d["id"], monto="500", sena="200000", sena_moneda="ARS")


def test_cancelar_reteniendo_la_sena_sigue_como_ingreso(client, op_headers):
    r = _reserva_con_sena(client, op_headers)
    assert client.patch(f"/reservas/{r['id']}/cancelar", headers=op_headers).status_code == 200
    assert _cobros_en_finanzas(client, op_headers) == 1
    assert len(client.get(f"/reservas/{r['id']}/pagos", headers=op_headers).json()) == 1


def test_cancelar_por_error_de_carga_elimina_los_pagos(client, op_headers):
    r = _reserva_con_sena(client, op_headers)
    resp = client.patch(f"/reservas/{r['id']}/cancelar", json={"anular_pagos": True}, headers=op_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["estado"] == "CANCELADO"
    assert float(resp.json()["total_pagado_usd"]) == 0
    assert client.get(f"/reservas/{r['id']}/pagos", headers=op_headers).json() == []
    assert _cobros_en_finanzas(client, op_headers) == 0
    assert client.get("/movimientos", headers=op_headers).json() == []  # no genera egreso


def test_anular_y_devolver_a_la_vez_es_invalido(client, op_headers):
    r = _reserva_con_sena(client, op_headers)
    resp = client.patch(
        f"/reservas/{r['id']}/cancelar",
        json={"anular_pagos": True, "devolucion_monto": "1000", "devolucion_moneda": "ARS"},
        headers=op_headers,
    )
    assert resp.status_code == 422
    # La reserva no se canceló
    assert client.get(f"/reservas/{r['id']}", headers=op_headers).json()["estado"] != "CANCELADO"


def test_eliminar_pago_de_reserva_ya_cancelada(client, op_headers):
    # Caso de corrección: reservas canceladas antes de existir "anular pagos".
    r = _reserva_con_sena(client, op_headers)
    client.patch(f"/reservas/{r['id']}/cancelar", headers=op_headers)
    pago = client.get(f"/reservas/{r['id']}/pagos", headers=op_headers).json()[0]
    resp = client.delete(f"/reservas/{r['id']}/pagos/{pago['id']}", headers=op_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["estado"] == "CANCELADO"
    assert _cobros_en_finanzas(client, op_headers) == 0


def test_no_se_registran_pagos_en_reservas_canceladas(client, op_headers):
    r = _reserva_con_sena(client, op_headers)
    client.patch(f"/reservas/{r['id']}/cancelar", headers=op_headers)
    pago = {"fecha_pago": r["fecha_ingreso"], "monto": "10", "moneda": "USD"}
    assert client.post(f"/reservas/{r['id']}/pagos", json=pago, headers=op_headers).status_code == 409
