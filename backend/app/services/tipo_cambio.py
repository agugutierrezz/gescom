"""Cotización del dólar oficial vía dolarapi.com, con caché en memoria."""

import time

import httpx
from fastapi import HTTPException, status

DOLARAPI_URL = "https://dolarapi.com/v1/dolares/oficial"
CACHE_TTL_SEGUNDOS = 600  # 10 minutos

_cache: dict | None = None
_cache_ts: float = 0.0


def obtener_cotizacion() -> dict:
    """Devuelve {'casa', 'nombre', 'compra', 'venta', 'fecha_actualizacion'}.

    Usa caché de 10 minutos. Si dolarapi no responde, cae al último valor
    cacheado (aunque esté vencido) antes de fallar con 503.
    """
    global _cache, _cache_ts

    if _cache is not None and (time.time() - _cache_ts) < CACHE_TTL_SEGUNDOS:
        return _cache

    try:
        respuesta = httpx.get(DOLARAPI_URL, timeout=5.0)
        respuesta.raise_for_status()
        data = respuesta.json()
        _cache = {
            "casa": data["casa"],
            "nombre": data["nombre"],
            "compra": float(data["compra"]),
            "venta": float(data["venta"]),
            "fecha_actualizacion": data["fechaActualizacion"],
        }
        _cache_ts = time.time()
        return _cache
    except (httpx.HTTPError, KeyError, ValueError):
        if _cache is not None:
            return _cache
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo obtener el tipo de cambio. Intentá nuevamente en unos minutos.",
        )
