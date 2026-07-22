"""Módulo financiero (RF-14/16/17): dashboard, transacciones, ocupación, cierre y reportes."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.movimiento import TipoMovimiento
from app.models.usuario import Usuario
from app.routers.deps import get_current_user
from app.services import finanzas
from app.services.reporte_financiero import generar_excel_financiero, generar_pdf_financiero

router = APIRouter(prefix="/finanzas", tags=["finanzas"])


def _periodo(fecha_desde: date | None, fecha_hasta: date | None) -> tuple[date, date]:
    """Sin parámetros, el período es el mes actual."""
    hoy = date.today()
    desde = fecha_desde or hoy.replace(day=1)
    hasta = fecha_hasta or finanzas.fin_de_mes(hoy)
    if hasta < desde:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="fecha_hasta debe ser posterior o igual a fecha_desde",
        )
    return desde, hasta


@router.get("/resumen")
def resumen_financiero(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """KPIs del período (RF-14) + serie mensual de ingresos vs egresos."""
    desde, hasta = _periodo(fecha_desde, fecha_hasta)
    return finanzas.resumen_financiero(db, usuario, desde, hasta)


@router.get("/transacciones")
def listar_transacciones(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    tipo: TipoMovimiento | None = None,
    q: str | None = None,
    categoria: str | None = None,
    departamento_id: int | None = None,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Listado unificado del período: cobros de reservas + movimientos operativos."""
    desde, hasta = _periodo(fecha_desde, fecha_hasta)
    tc = finanzas.tipo_cambio_actual(db, usuario)
    return finanzas.transacciones(
        db, usuario, desde, hasta, tc,
        tipo=tipo, q=q, categoria=categoria, departamento_id=departamento_id,
    )


@router.get("/ocupacion")
def reporte_ocupacion(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reporte de ocupación por unidad para el período."""
    desde, hasta = _periodo(fecha_desde, fecha_hasta)
    return finanzas.ocupacion_por_unidad(db, usuario, desde, hasta)


@router.get("/cierre")
def cierre_periodo(
    anio: int = Query(ge=2000, le=2100),
    mes: int | None = Query(default=None, ge=1, le=12),
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cierre de período: mensual (anio + mes) o anual (solo anio)."""
    return finanzas.cierre_periodo(db, usuario, anio, mes)


def _datos_reporte(db: Session, usuario: Usuario, desde: date, hasta: date) -> dict:
    resumen = finanzas.resumen_financiero(db, usuario, desde, hasta)
    tc = finanzas.tipo_cambio_actual(db, usuario)
    if hasta.year == desde.year and (desde.day, desde.month, hasta) == (1, hasta.month, finanzas.fin_de_mes(desde)):
        desglose = finanzas.cierre_periodo(db, usuario, desde.year, desde.month)
    elif (desde, hasta) == (date(desde.year, 1, 1), date(desde.year, 12, 31)):
        desglose = finanzas.cierre_periodo(db, usuario, desde.year, None)
    else:
        desglose = finanzas.desglose_periodo(db, usuario, desde, hasta, tc)
    return {
        **resumen,
        "desglose": desglose,
        "ocupacion": finanzas.ocupacion_por_unidad(db, usuario, desde, hasta),
        "transacciones": finanzas.transacciones(db, usuario, desde, hasta, tc),
    }


@router.get("/reporte/pdf")
def reporte_pdf(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reporte financiero del período en PDF (RF-17)."""
    desde, hasta = _periodo(fecha_desde, fecha_hasta)
    contenido = generar_pdf_financiero(_datos_reporte(db, usuario, desde, hasta))
    nombre = f"reporte_financiero_{desde:%Y-%m-%d}_{hasta:%Y-%m-%d}.pdf"
    return Response(
        content=contenido,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.get("/reporte/excel")
def reporte_excel(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reporte financiero del período en Excel (RF-17)."""
    desde, hasta = _periodo(fecha_desde, fecha_hasta)
    contenido = generar_excel_financiero(_datos_reporte(db, usuario, desde, hasta))
    nombre = f"reporte_financiero_{desde:%Y-%m-%d}_{hasta:%Y-%m-%d}.xlsx"
    return Response(
        content=contenido,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )
