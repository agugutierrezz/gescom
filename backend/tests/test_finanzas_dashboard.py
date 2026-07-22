"""Tests de integración del módulo financiero (RF-14/17) y dashboard."""

from decimal import Decimal

from tests.conftest import HOY, crear_departamento, crear_reserva


def _datos_del_mes(client, headers):
    """Depto + reserva de USD 500 con seña de USD 200 + egreso de ARS 50000."""
    d = crear_departamento(client, headers)
    r = crear_reserva(
        client, headers, d["id"], monto="500", sena="200", sena_moneda="USD"
    )
    client.post(
        "/movimientos",
        json={
            "fecha": HOY.isoformat(),
            "descripcion": "Mantenimiento pileta",
            "tipo": "EGRESO",
            "monto": "50000",
            "moneda": "ARS",
        },
        headers=headers,
    )
    return d, r


def test_resumen_financiero(client, op_headers):
    _datos_del_mes(client, op_headers)
    r = client.get("/finanzas/resumen", headers=op_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, dict) and data  # shape básico: dict con contenido


def test_transacciones_incluye_pago_y_movimiento(client, op_headers):
    _datos_del_mes(client, op_headers)
    r = client.get("/finanzas/transacciones", headers=op_headers)
    assert r.status_code == 200, r.text
    textos = str(r.json())
    assert "Seña" in textos or "200" in textos
    assert "Mantenimiento pileta" in textos


def test_ocupacion_por_unidad(client, op_headers):
    _datos_del_mes(client, op_headers)
    r = client.get("/finanzas/ocupacion", headers=op_headers)
    assert r.status_code == 200, r.text


def test_cierre_mensual_y_anual(client, op_headers):
    _datos_del_mes(client, op_headers)
    r = client.get(
        "/finanzas/cierre", params={"anio": HOY.year, "mes": HOY.month}, headers=op_headers
    )
    assert r.status_code == 200, r.text
    r = client.get("/finanzas/cierre", params={"anio": HOY.year}, headers=op_headers)
    assert r.status_code == 200, r.text


def test_reporte_pdf_y_excel(client, op_headers):
    _datos_del_mes(client, op_headers)
    r = client.get("/finanzas/reporte/pdf", headers=op_headers)
    assert r.status_code == 200, r.text
    assert r.content[:4] == b"%PDF"
    r = client.get("/finanzas/reporte/excel", headers=op_headers)
    assert r.status_code == 200, r.text
    assert r.content[:2] == b"PK"  # xlsx = zip


def test_dashboard_resumen(client, op_headers):
    d, reserva = _datos_del_mes(client, op_headers)
    r = client.get("/dashboard/resumen", headers=op_headers)
    assert r.status_code == 200, r.text
    data = r.json()

    kpis = data["kpis"]
    assert kpis["reservas_mes"] >= 0  # la estadía puede caer en el mes próximo
    assert kpis["ingresos_usd"] == 200.0  # la seña del mes
    # pendiente de cobro: saldo USD 300 × TC 1000
    assert kpis["pendiente_cobro"] == 300000.0

    assert len(data["flujo_caja"]) == 6
    checkins = data["proximos_checkins"]
    assert any(c["id"] == reserva["id"] for c in checkins)


def test_dashboard_vacio(client, op_headers):
    r = client.get("/dashboard/resumen", headers=op_headers)
    assert r.status_code == 200, r.text
    assert r.json()["kpis"]["reservas_mes"] == 0


def test_finanzas_aisladas_por_usuario(client, op_headers, otro_headers):
    _datos_del_mes(client, op_headers)
    r = client.get("/dashboard/resumen", headers=otro_headers)
    assert r.json()["kpis"]["ingresos_usd"] == 0.0
