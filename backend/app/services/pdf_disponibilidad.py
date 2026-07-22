"""Calendario de disponibilidad mensual en PDF (ReportLab)."""

import calendar
from datetime import date
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas

from app.models.departamento import Departamento
from app.models.reserva import Reserva

PRIMARIO = colors.HexColor("#00526d")
GRIS = colors.HexColor("#40484d")
GRIS_CLARO = colors.HexColor("#70787e")
LINEA = colors.HexColor("#bfc8ce")

# Codificación de colores del calendario
COLOR_PASADO = colors.HexColor("#d3e6e8")
COLOR_DISPONIBLE = colors.HexColor("#d9f2e4")
COLOR_OCUPADO = colors.HexColor("#ffdad6")
COLOR_INTERCAMBIO = colors.HexColor("#fedb9c")
COLOR_OTRO_MES = colors.HexColor("#f3f6f7")

MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
DIAS_SEMANA = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"]

ESTADO_LABELS = {
    "PENDIENTE": "Pendiente",
    "PARCIAL": "Pago parcial",
    "PAGADO": "Pagado",
    "CANCELADO": "Cancelado",
}


def estado_dia(dia: date, reservas: list[Reserva], hoy: date) -> str:
    """GRIS=pasado, AMARILLO=intercambio (check-in/out), ROJO=ocupado, VERDE=disponible."""
    if dia < hoy:
        return "PASADO"
    for r in reservas:
        if dia == r.fecha_ingreso or dia == r.fecha_egreso:
            return "INTERCAMBIO"
    for r in reservas:
        if r.fecha_ingreso < dia < r.fecha_egreso:
            return "OCUPADO"
    return "DISPONIBLE"


COLORES_ESTADO = {
    "PASADO": COLOR_PASADO,
    "DISPONIBLE": COLOR_DISPONIBLE,
    "OCUPADO": COLOR_OCUPADO,
    "INTERCAMBIO": COLOR_INTERCAMBIO,
}


def generar_pdf_disponibilidad(
    departamento: Departamento,
    anio: int,
    mes: int,
    reservas: list[Reserva],
) -> bytes:
    buffer = BytesIO()
    pdf = Canvas(buffer, pagesize=A4)
    ancho, alto = A4
    margen = 18 * mm
    y = alto - margen
    hoy = date.today()

    # Encabezado (logo GESCOM: documento propio del sistema)
    from app.services.branding import GESCOM_LOGO, dibujar_logo

    dibujar_logo(pdf, GESCOM_LOGO, margen, y + 8, 12 * mm)
    pdf.setFillColor(GRIS)
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawRightString(ancho - margen, y, "Calendario de Disponibilidad")
    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(GRIS_CLARO)
    pdf.drawRightString(ancho - margen, y - 14, f"Emitido el {hoy:%d/%m/%Y}")

    y -= 28
    pdf.setStrokeColor(LINEA)
    pdf.line(margen, y, ancho - margen, y)
    y -= 22

    # Departamento y mes
    pdf.setFillColor(GRIS)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(margen, y, f"{departamento.nombre} — {MESES[mes - 1]} {anio}")

    # Leyenda
    leyenda = [
        ("Pasado", COLOR_PASADO),
        ("Disponible", COLOR_DISPONIBLE),
        ("Ocupado", COLOR_OCUPADO),
        ("Intercambio", COLOR_INTERCAMBIO),
    ]
    x_leg = ancho - margen
    pdf.setFont("Helvetica", 8)
    for etiqueta, color in reversed(leyenda):
        ancho_texto = pdf.stringWidth(etiqueta, "Helvetica", 8)
        x_leg -= ancho_texto
        pdf.setFillColor(GRIS)
        pdf.drawString(x_leg, y, etiqueta)
        x_leg -= 5 * mm
        pdf.setFillColor(color)
        pdf.setStrokeColor(LINEA)
        pdf.rect(x_leg, y - 1, 3.5 * mm, 3.5 * mm, fill=1, stroke=1)
        x_leg -= 6 * mm

    y -= 12

    # Grilla del calendario (semanas que empiezan en domingo)
    ancho_celda = (ancho - 2 * margen) / 7
    alto_encabezado = 7 * mm
    alto_celda = 15 * mm
    semanas = calendar.Calendar(firstweekday=6).monthdatescalendar(anio, mes)

    # Encabezado de días
    y_grid = y - alto_encabezado
    pdf.setFillColor(colors.HexColor("#FDFAF4"))
    pdf.setStrokeColor(LINEA)
    pdf.rect(margen, y_grid, ancho - 2 * margen, alto_encabezado, fill=1, stroke=1)
    pdf.setFillColor(GRIS_CLARO)
    pdf.setFont("Helvetica-Bold", 8)
    for i, nombre in enumerate(DIAS_SEMANA):
        pdf.drawCentredString(margen + ancho_celda * (i + 0.5), y_grid + 2.4 * mm, nombre)

    # Celdas
    for semana in semanas:
        y_grid -= alto_celda
        for i, dia in enumerate(semana):
            x = margen + ancho_celda * i
            if dia.month != mes:
                relleno = COLOR_OTRO_MES
                color_num = GRIS_CLARO
            else:
                relleno = COLORES_ESTADO[estado_dia(dia, reservas, hoy)]
                color_num = GRIS
            pdf.setFillColor(relleno)
            pdf.setStrokeColor(LINEA)
            pdf.rect(x, y_grid, ancho_celda, alto_celda, fill=1, stroke=1)
            pdf.setFillColor(color_num)
            pdf.setFont("Helvetica-Bold" if dia.month == mes else "Helvetica", 9)
            pdf.drawRightString(x + ancho_celda - 2 * mm, y_grid + alto_celda - 4 * mm, str(dia.day))

    y = y_grid - 14 * mm

    # Reservas del mes
    pdf.setFillColor(GRIS)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(margen, y, "Reservas del mes")
    y -= 6
    pdf.setStrokeColor(LINEA)
    pdf.line(margen, y, ancho - margen, y)
    y -= 14

    if not reservas:
        pdf.setFont("Helvetica", 10)
        pdf.setFillColor(GRIS_CLARO)
        pdf.drawString(margen, y, "Sin reservas en el mes seleccionado.")
    else:
        col_inicio = margen + 78 * mm
        col_fin = margen + 110 * mm
        col_estado = margen + 142 * mm
        pdf.setFont("Helvetica-Bold", 8)
        pdf.setFillColor(GRIS_CLARO)
        pdf.drawString(margen, y, "CLIENTE")
        pdf.drawString(col_inicio, y, "FECHA INICIO")
        pdf.drawString(col_fin, y, "FECHA FIN")
        pdf.drawString(col_estado, y, "ESTADO")
        y -= 13
        pdf.setFont("Helvetica", 10)
        for r in reservas:
            if y < margen + 10:
                pdf.showPage()
                y = alto - margen
                pdf.setFont("Helvetica", 10)
            pdf.setFillColor(GRIS)
            cliente = r.cliente if len(r.cliente) <= 40 else f"{r.cliente[:37]}..."
            pdf.drawString(margen, y, cliente)
            pdf.drawString(col_inicio, y, f"{r.fecha_ingreso:%d/%m/%Y}")
            pdf.drawString(col_fin, y, f"{r.fecha_egreso:%d/%m/%Y}")
            pdf.setFillColor(GRIS_CLARO)
            pdf.drawString(col_estado, y, ESTADO_LABELS.get(r.estado.value, r.estado.value))
            y -= 14

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
