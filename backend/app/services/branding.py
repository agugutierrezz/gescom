"""Identidad visual de los PDFs.

- Logo GESCOM: encabezado de los documentos propios del sistema
  (reporte financiero, calendario de disponibilidad).
- Branding por complejo: el comprobante de reserva es un documento del
  complejo (se le muestra al cliente), por lo que lleva el logo y los datos
  del complejo asociado al usuario dueño de la reserva.
"""

from pathlib import Path

from reportlab.lib.utils import ImageReader

ASSETS = Path(__file__).resolve().parents[1] / "assets"
GESCOM_LOGO = ASSETS / "gescom_logo.png"

# Branding por nombre de usuario (el nombre actúa como username del complejo).
COMPLEJOS: dict[str, dict] = {
    "puntapiedras": {
        "nombre": "Punta Piedras — Cabañas de mar",
        "logo": ASSETS / "complejos" / "puntapiedras" / "logo.png",
        "direccion": "Mar del Plata e/ 38 y 39",
        "ciudad": "Mar Azul, Partido de Villa Gesell, Provincia de Buenos Aires",
        "cp": "B7165",
    },
}


def branding_de(nombre_usuario: str | None) -> dict | None:
    """Branding del complejo, o None si el usuario no tiene uno configurado."""
    if not nombre_usuario:
        return None
    return COMPLEJOS.get(nombre_usuario)


def dibujar_logo(pdf, path: Path, x: float, y_sup: float, alto: float) -> float:
    """Dibuja el logo con su tope en y_sup, manteniendo proporciones.

    Devuelve el ancho dibujado. Si el archivo no existe, no dibuja nada.
    """
    if not Path(path).exists():
        return 0.0
    img = ImageReader(str(path))
    iw, ih = img.getSize()
    ancho = alto * iw / ih
    pdf.drawImage(img, x, y_sup - alto, width=ancho, height=alto, mask="auto")
    return ancho
