"""Totales en pesos del comprobante y tipo de cambio manual de la reserva."""

from datetime import date
from decimal import Decimal

from app.models.pago import Moneda, Pago, TipoPago
from app.models.reserva import DescuentoTipo, Reserva
from app.services.cuenta_corriente import (
    saldo_ars,
    saldo_usd,
    total_neto_ars,
    total_pagado_ars,
    total_pagado_usd,
)
from tests.conftest import crear_departamento, crear_reserva


def _reserva(monto_usd, tc, pagos=(), descuento=None):
    tc = Decimal(tc)
    r = Reserva(
        monto_usd=Decimal(monto_usd),
        monto_pesos=Decimal(monto_usd) * tc,
        tipo_cambio=tc,
        descuento_tipo=descuento[0] if descuento else None,
        descuento_valor=Decimal(descuento[1]) if descuento else None,
    )
    r.pagos = [
        Pago(tipo=tipo, moneda=moneda, monto_final=Decimal(monto), fecha_pago=date.today())
        for tipo, moneda, monto in pagos
    ]
    return r


def test_sena_en_pesos_se_muestra_exacta_en_pesos():
    # Caso real del comprobante: seña de $ 750.000 con TC 1530
    r = _reserva("980.39", "1530", [(TipoPago.PAGO, Moneda.ARS, "750000")])
    assert total_pagado_ars(r) == Decimal("750000.00")
    assert total_neto_ars(r) == Decimal("1499996.70")  # 980.39 × 1530
    assert saldo_ars(r) == Decimal("749996.70")
    # En USD sigue dando lo mismo que antes
    assert total_pagado_usd(r) == Decimal("490.20")


def test_pesos_con_cargos_usd_y_descuento():
    r = _reserva(
        "1000",
        "1000",
        [
            (TipoPago.CARGO, Moneda.USD, "50"),  # + $ 50.000
            (TipoPago.PAGO, Moneda.ARS, "300000"),
            (TipoPago.PAGO, Moneda.USD, "100"),  # $ 100.000
        ],
        descuento=(DescuentoTipo.PORCENTAJE, "10"),  # - $ 100.000
    )
    assert total_neto_ars(r) == Decimal("950000.00")
    assert total_pagado_ars(r) == Decimal("400000.00")
    assert saldo_ars(r) == Decimal("550000.00")
    assert saldo_usd(r) == Decimal("550.00")


def test_descuento_monto_usd_se_convierte_a_pesos():
    r = _reserva("500", "1200", descuento=(DescuentoTipo.MONTO, "100"))
    assert total_neto_ars(r) == Decimal("480000.00")  # (500 - 100) × 1200


def test_pdf_con_movimientos_en_pesos_y_mixtos(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], sena="200000", sena_moneda="ARS")
    resp = client.get(f"/reservas/{r['id']}/pdf", headers=op_headers)
    assert resp.status_code == 200 and resp.content[:4] == b"%PDF"

    pago = {"fecha_pago": date.today().isoformat(), "monto": "50", "moneda": "USD", "medio_pago": "Efectivo"}
    assert client.post(f"/reservas/{r['id']}/pagos", json=pago, headers=op_headers).status_code in (200, 201)
    resp = client.get(f"/reservas/{r['id']}/pdf", headers=op_headers)
    assert resp.status_code == 200 and resp.content[:4] == b"%PDF"


def test_reserva_con_tipo_cambio_distinto_a_la_cotizacion(client, op_headers):
    # La cotización mockeada es 1000; el usuario usa el TC con el que fijó el precio.
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500", moneda="USD", tipo_cambio="1250.50")
    assert Decimal(r["tipo_cambio"]) == Decimal("1250.50")
    assert Decimal(r["monto_pesos"]) == Decimal("625250.00")


def test_editar_tipo_cambio_de_la_reserva(client, op_headers):
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"], monto="500", moneda="USD")
    body = {
        "cliente": r["cliente"],
        "id_departamento": d["id"],
        "fecha_ingreso": r["fecha_ingreso"],
        "fecha_egreso": r["fecha_egreso"],
        "monto": "500",
        "moneda": "USD",
        "tipo_cambio": "1100",
    }
    resp = client.put(f"/reservas/{r['id']}", json=body, headers=op_headers)
    assert resp.status_code == 200, resp.text
    assert Decimal(resp.json()["tipo_cambio"]) == Decimal("1100.00")
    assert Decimal(resp.json()["monto_pesos"]) == Decimal("550000.00")
