"""Comprobante de reserva en PDF (ReportLab)."""

from decimal import Decimal
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas

from app.models.pago import TipoPago
from app.models.reserva import DescuentoTipo, Reserva
from app.services.branding import GESCOM_LOGO, branding_de, dibujar_logo
from app.services.cuenta_corriente import descuento_usd, saldo_usd, total_neto_usd, total_pagado_usd

PRIMARIO = colors.HexColor("#00526d")
GRIS = colors.HexColor("#40484d")
GRIS_CLARO = colors.HexColor("#70787e")
LINEA = colors.HexColor("#bfc8ce")

ESTADO_LABELS = {
    "PENDIENTE": "Pendiente",
    "PARCIAL": "Pago parcial",
    "PAGADO": "Pagado",
    "CANCELADO": "Cancelado",
}


def _fmt_ars(valor) -> str:
    entero, dec = f"{Decimal(valor):,.2f}".split(".")
    return f"$ {entero.replace(',', '.')},{dec}"


def _fmt_usd(valor) -> str:
    return f"USD {Decimal(valor):,.2f}"


def generar_pdf_reserva(reserva: Reserva) -> bytes:
    buffer = BytesIO()
    pdf = Canvas(buffer, pagesize=A4)
    ancho, alto = A4
    margen = 20 * mm
    y = alto - margen

    # Encabezado: el comprobante es un documento del complejo (se le entrega al
    # cliente), por eso lleva el logo del complejo del usuario dueño de la
    # reserva. Si el usuario no tiene branding configurado, va el logo GESCOM.
    # El logo se centra verticalmente respecto del título de la derecha.
    marca = branding_de(reserva.usuario.nombre if reserva.usuario else None)
    logo_path = marca["logo"] if marca is not None else GESCOM_LOGO
    alto_logo = 15 * mm if marca is not None else 12 * mm
    dibujar_logo(pdf, logo_path, margen, y + 5 + alto_logo / 2, alto_logo)

    pdf.setFillColor(GRIS)
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawRightString(ancho - margen, y, f"Comprobante de Reserva N° {reserva.id}")
    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(GRIS_CLARO)
    pdf.drawRightString(ancho - margen, y - 14, f"Emitido el {reserva.created_at:%d/%m/%Y}")

    y = min(y + 5 - alto_logo / 2, y - 14) - 12
    pdf.setStrokeColor(LINEA)
    pdf.line(margen, y, ancho - margen, y)
    y -= 24

    def campo(etiqueta: str, valor: str, x: float, y_pos: float) -> None:
        pdf.setFont("Helvetica-Bold", 8)
        pdf.setFillColor(GRIS_CLARO)
        pdf.drawString(x, y_pos, etiqueta.upper())
        pdf.setFont("Helvetica", 11)
        pdf.setFillColor(GRIS)
        pdf.drawString(x, y_pos - 14, valor)

    col2 = ancho / 2 + 10 * mm

    # Datos del complejo (solo con branding): mismo estilo que los de la reserva
    if marca is not None:
        campo("Dirección", marca["direccion"], margen, y)
        campo("Código postal", marca["cp"], col2, y)
        y -= 38
        campo("Ciudad", marca["ciudad"], margen, y)
        y -= 34
        pdf.setStrokeColor(LINEA)
        pdf.line(margen, y, ancho - margen, y)
        y -= 24

    campo("Cliente", reserva.cliente, margen, y)
    campo("Departamento", reserva.departamento.nombre if reserva.departamento else "-", col2, y)
    y -= 38
    campo("Fecha de ingreso", f"{reserva.fecha_ingreso:%d/%m/%Y}", margen, y)
    campo("Fecha de egreso", f"{reserva.fecha_egreso:%d/%m/%Y}", col2, y)
    y -= 38
    noches = (reserva.fecha_egreso - reserva.fecha_ingreso).days
    campo("Noches", str(noches), margen, y)
    campo("Estado", ESTADO_LABELS.get(reserva.estado.value, reserva.estado.value), col2, y)
    y -= 44

    # Montos
    descuento = descuento_usd(reserva)
    total = total_neto_usd(reserva)
    alto_caja = 96 if descuento > 0 else 58
    pdf.setFillColor(colors.HexColor("#e4f7f9"))
    pdf.roundRect(margen, y - (alto_caja - 12), ancho - 2 * margen, alto_caja, 6, stroke=0, fill=1)
    campo("Monto en dólares", _fmt_usd(reserva.monto_usd), margen + 6 * mm, y - 4)
    campo("Tipo de cambio", _fmt_ars(reserva.tipo_cambio) + " /USD", margen + 65 * mm, y - 4)
    campo("Monto en pesos", _fmt_ars(reserva.monto_pesos), margen + 125 * mm, y - 4)
    if descuento > 0:
        y -= 38
        etiqueta_desc = (
            f"Descuento ({Decimal(reserva.descuento_valor).normalize():f}%)"
            if reserva.descuento_tipo == DescuentoTipo.PORCENTAJE
            else "Descuento"
        )
        campo(etiqueta_desc, f"- {_fmt_usd(descuento)}", margen + 6 * mm, y - 4)
        campo("Total con descuento", _fmt_usd(total), margen + 65 * mm, y - 4)
        campo("Total en pesos", _fmt_ars(total * Decimal(reserva.tipo_cambio)), margen + 125 * mm, y - 4)
    y -= 70

    # Pagos
    pagos = [p for p in reserva.pagos if p.tipo == TipoPago.PAGO]
    cargos = [p for p in reserva.pagos if p.tipo == TipoPago.CARGO]
    if pagos or cargos:
        pdf.setFont("Helvetica-Bold", 11)
        pdf.setFillColor(PRIMARIO)
        pdf.drawString(margen, y, "Movimientos de cuenta")
        y -= 18
        pdf.setFont("Helvetica-Bold", 8)
        pdf.setFillColor(GRIS_CLARO)
        pdf.drawString(margen, y, "FECHA")
        pdf.drawString(margen + 30 * mm, y, "TIPO")
        pdf.drawString(margen + 55 * mm, y, "CONCEPTO")
        pdf.drawString(margen + 110 * mm, y, "MEDIO")
        pdf.drawRightString(ancho - margen, y, "MONTO")
        y -= 4
        pdf.setStrokeColor(LINEA)
        pdf.line(margen, y, ancho - margen, y)
        y -= 14
        pdf.setFont("Helvetica", 10)
        for pago in reserva.pagos:
            pdf.setFillColor(GRIS)
            pdf.drawString(margen, y, f"{pago.fecha_pago:%d/%m/%Y}")
            pdf.drawString(margen + 30 * mm, y, "Pago" if pago.tipo == TipoPago.PAGO else "Cargo")
            pdf.drawString(margen + 55 * mm, y, (pago.concepto or "-")[:35])
            pdf.drawString(margen + 110 * mm, y, (pago.medio_pago or "-")[:20])
            moneda = "USD" if pago.moneda.value == "USD" else "$"
            pdf.drawRightString(ancho - margen, y, f"{moneda} {Decimal(pago.monto_final):,.2f}")
            y -= 16

        # Totales de cuenta
        y -= 2
        pdf.setStrokeColor(LINEA)
        pdf.line(margen + 100 * mm, y + 6, ancho - margen, y + 6)
        y -= 8
        pdf.setFont("Helvetica", 10)
        pdf.setFillColor(GRIS)
        pdf.drawRightString(ancho - margen - 45 * mm, y, "Total pagado:")
        pdf.drawRightString(ancho - margen, y, _fmt_usd(total_pagado_usd(reserva)))
        y -= 16
        saldo = max(Decimal("0"), saldo_usd(reserva))
        pdf.setFont("Helvetica-Bold", 10)
        pdf.setFillColor(PRIMARIO if saldo > 0 else colors.HexColor("#00573d"))
        pdf.drawRightString(ancho - margen - 45 * mm, y, "Saldo pendiente:")
        pdf.drawRightString(ancho - margen, y, _fmt_usd(saldo))
        y -= 16

    # Nota: las observaciones son internas del complejo y el comprobante se
    # entrega al cliente, por eso no se incluyen. Tampoco lleva pie del sistema.

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
