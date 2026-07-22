"""Prueba de integración end-to-end (a nivel API) del flujo completo del sistema.

Recorre: alta de operador por el admin → login → alta de departamento →
cotización → reserva con seña en ARS → cuenta corriente → pago final →
dashboard → cancelación y liberación de fechas → aislamiento entre usuarios.
"""

from datetime import timedelta
from decimal import Decimal

from tests.conftest import HOY, PASSWORD_TESTS


def test_flujo_completo(client, admin, admin_headers):
    # 1. El admin da de alta la cuenta del complejo
    r = client.post(
        "/usuarios", json={"nombre": "complejo.mar", "password": "clave12345"},
        headers=admin_headers,
    )
    assert r.status_code == 201

    # 2. El operador inicia sesión
    r = client.post("/auth/login", json={"nombre": "complejo.mar", "password": "clave12345"})
    assert r.status_code == 200
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    # 3. Crea su departamento
    r = client.post(
        "/departamentos",
        json={"nombre": "Cabaña Mar", "descripcion": "Frente al lago", "capacidad_maxima": 4},
        headers=headers,
    )
    assert r.status_code == 201
    depto = r.json()

    # 4. Consulta la cotización (mockeada: venta = 1000)
    r = client.get("/tipo-cambio", headers=headers)
    assert r.status_code == 200
    tc = str(r.json()["venta"])

    # 5. Crea la reserva: USD 1000, 10% de descuento, seña ARS 300.000 (= USD 300)
    ingreso = HOY + timedelta(days=7)
    egreso = ingreso + timedelta(days=7)
    r = client.post(
        "/reservas",
        json={
            "cliente": "Familia Rodríguez",
            "id_departamento": depto["id"],
            "fecha_ingreso": ingreso.isoformat(),
            "fecha_egreso": egreso.isoformat(),
            "monto": "1000",
            "moneda": "USD",
            "tipo_cambio": tc,
            "descuento_tipo": "PORCENTAJE",
            "descuento_valor": "10",
            "sena": "300000",
            "sena_moneda": "ARS",
            "sena_medio_pago": "Transferencia",
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    reserva = r.json()
    assert reserva["estado"] == "PARCIAL"
    assert Decimal(reserva["total_usd"]) == Decimal("900.00")   # 1000 - 10%
    assert Decimal(reserva["total_pagado_usd"]) == Decimal("300.00")
    assert Decimal(reserva["saldo_usd"]) == Decimal("600.00")

    # 6. La cuenta corriente registra la seña
    pagos = client.get(f"/reservas/{reserva['id']}/pagos", headers=headers).json()
    assert len(pagos) == 1 and pagos[0]["concepto"] == "Seña"

    # 7. Un intento de reserva solapada en el mismo depto es rechazado
    r = client.post(
        "/reservas",
        json={
            "cliente": "Otro Cliente",
            "id_departamento": depto["id"],
            "fecha_ingreso": (ingreso + timedelta(days=2)).isoformat(),
            "fecha_egreso": (egreso + timedelta(days=2)).isoformat(),
            "monto": "500",
            "moneda": "USD",
            "tipo_cambio": tc,
        },
        headers=headers,
    )
    assert r.status_code == 409

    # 8. Pago final del saldo y estado PAGADO
    r = client.post(
        f"/reservas/{reserva['id']}/pagos",
        json={
            "fecha_pago": HOY.isoformat(),
            "monto": "600",
            "moneda": "USD",
            "medio_pago": "Efectivo",
            "concepto": "Saldo estadía",
        },
        headers=headers,
    )
    assert r.status_code == 201
    assert r.json()["estado"] == "PAGADO"
    assert Decimal(r.json()["saldo_usd"]) == Decimal("0.00")

    # 9. El PDF de la reserva sale correctamente
    r = client.get(f"/reservas/{reserva['id']}/pdf", headers=headers)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"

    # 10. El dashboard refleja los cobros (seña USD 300 eq. + saldo USD 600)
    r = client.get("/dashboard/resumen", headers=headers)
    assert r.status_code == 200
    kpis = r.json()["kpis"]
    assert kpis["ingresos_ars"] == 300000.0
    assert kpis["ingresos_usd"] == 600.0
    assert kpis["pendiente_cobro"] == 0.0

    # 11. El admin NO ve los datos del operador (aislamiento multiusuario)
    assert client.get("/reservas", headers=admin_headers).json() == []
    assert client.get("/departamentos", headers=admin_headers).json() == []
    r = client.get(f"/reservas/{reserva['id']}", headers=admin_headers)
    assert r.status_code == 404

    # 12. Cancelación: libera fechas para una nueva reserva
    r = client.patch(f"/reservas/{reserva['id']}/cancelar", headers=headers)
    assert r.status_code == 200 and r.json()["estado"] == "CANCELADO"
    r = client.post(
        "/reservas",
        json={
            "cliente": "Cliente Nuevo",
            "id_departamento": depto["id"],
            "fecha_ingreso": ingreso.isoformat(),
            "fecha_egreso": egreso.isoformat(),
            "monto": "800",
            "moneda": "USD",
            "tipo_cambio": tc,
        },
        headers=headers,
    )
    assert r.status_code == 201
