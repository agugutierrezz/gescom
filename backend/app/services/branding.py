"""Identidad visual de los PDFs.

- Logo GESCOM: encabezado de los documentos propios del sistema
  (reporte financiero, calendario de disponibilidad).
- Branding por complejo: el comprobante de reserva es un documento del
  complejo (se le muestra al cliente), por lo que lleva el logo y los datos
  del complejo asociado al usuario dueño de la reserva.

Los datos de cada complejo NO están en el código: se leen de la variable de
entorno BRANDING_COMPLEJOS (JSON), con el nombre de usuario como clave:

    {"usuario": {"nombre": "...", "direccion": "...", "ciudad": "...", "cp": "...",
                 "logo": "complejos/usuario/logo.png"}}

"logo" es una ruta relativa a app/assets (o absoluta). Donde el archivo no
existe (ej. el servidor de producción, porque el logo no se sube al repo) se
puede usar "logo_base64" con el PNG codificado en base64.
"""

import base64
import binascii
import json
import logging
from io import BytesIO
from pathlib import Path

from reportlab.lib.utils import ImageReader

from app.core.config import settings

logger = logging.getLogger(__name__)

ASSETS = Path(__file__).resolve().parents[1] / "assets"
GESCOM_LOGO = ASSETS / "gescom_logo.png"

CAMPOS_TEXTO = ("nombre", "direccion", "ciudad", "cp")


def _complejos() -> dict[str, dict]:
    """Parsea BRANDING_COMPLEJOS. Si está vacío o mal formado, no hay branding."""
    crudo = (settings.BRANDING_COMPLEJOS or "").strip()
    if not crudo:
        return {}
    try:
        data = json.loads(crudo)
    except json.JSONDecodeError:
        logger.warning("BRANDING_COMPLEJOS no es un JSON válido: se ignora el branding.")
        return {}
    if not isinstance(data, dict):
        logger.warning("BRANDING_COMPLEJOS debe ser un objeto JSON: se ignora el branding.")
        return {}
    return {k: v for k, v in data.items() if isinstance(v, dict)}


def _resolver_logo(cfg: dict) -> Path | BytesIO:
    """Logo del complejo: base64 > ruta > logo GESCOM como último recurso."""
    if cfg.get("logo_base64"):
        try:
            return BytesIO(base64.b64decode(cfg["logo_base64"], validate=True))
        except (binascii.Error, ValueError):
            logger.warning("logo_base64 inválido en BRANDING_COMPLEJOS.")
    if cfg.get("logo"):
        ruta = Path(cfg["logo"])
        ruta = ruta if ruta.is_absolute() else ASSETS / ruta
        if ruta.exists():
            return ruta
    return GESCOM_LOGO


def branding_de(nombre_usuario: str | None) -> dict | None:
    """Branding del complejo, o None si el usuario no tiene uno configurado.

    Devuelve siempre las claves nombre/direccion/ciudad/cp (texto, "" si
    faltan) y logo (Path o BytesIO).
    """
    if not nombre_usuario:
        return None
    cfg = _complejos().get(nombre_usuario)
    if cfg is None:
        return None
    marca = {campo: str(cfg.get(campo) or "") for campo in CAMPOS_TEXTO}
    marca["logo"] = _resolver_logo(cfg)
    return marca


def dibujar_logo(pdf, logo: Path | BytesIO, x: float, y_sup: float, alto: float) -> float:
    """Dibuja el logo con su tope en y_sup, manteniendo proporciones.

    Devuelve el ancho dibujado. Si el archivo no existe o no es una imagen
    válida, no dibuja nada.
    """
    if isinstance(logo, (str, Path)):
        if not Path(logo).exists():
            return 0.0
        logo = str(logo)
    else:
        logo.seek(0)
    try:
        img = ImageReader(logo)
        iw, ih = img.getSize()
    except Exception:  # noqa: BLE001 — un logo roto no debe romper el PDF
        logger.warning("No se pudo leer el logo del PDF.")
        return 0.0
    ancho = alto * iw / ih
    pdf.drawImage(img, x, y_sup - alto, width=ancho, height=alto, mask="auto")
    return ancho
