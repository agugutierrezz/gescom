"""Dashboard principal: GET /dashboard/resumen con el shape que espera el frontend."""

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models.movimiento import Movimiento, TipoMovimiento
from app.models.pago import Moneda, Pago
from app.models.reserva import EstadoReserva, Reserva
from app.models.usuario import Usuario
from app.routers.deps import get_current_user
from app.services import finanzas

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Estados de reserva → etiquetas del dashboard (según cobro de la seña).
ESTADO_LABELS = {
    EstadoReserva.PAGADO: "Confirmado",
    EstadoReserva.PARCIAL: "Pendiente",
    EstadoReserva.PENDIENTE: "Seña impaga",
}


def _ingresos_por_moneda(db: Session, usuario: Usuario, desde: date, hasta: date) -> dict:
    """Ingresos del período por moneda, sin conversión: pagos de reservas + movimientos INGRESO."""
    totales = {"ARS": Decimal("0"), "USD": Decimal("0")}
    filas = db.execute(
        select(Pago.moneda, func.coalesce(func.sum(Pago.monto_final), 0))
        .join(Reserva, Pago.id_reserva == Reserva.id)
        .where(
            Reserva.id_usuario == usuario.id,
            Pago.tipo == finanzas.TipoPago.PAGO,
            Pago.fecha_pago >= desde,
            Pago.fecha_pago <= hasta,
        )
        .group_by(Pago.moneda)
    ).all()
    for moneda, monto in filas:
        clave = moneda.value if isinstance(moneda, Moneda) else str(moneda)
        totales[clave] += Decimal(monto)
    filas = db.execute(
        select(Movimiento.moneda, func.coalesce(func.sum(Movimiento.monto), 0))
        .where(
            Movimiento.id_usuario == usuario.id,
            Movimiento.tipo == TipoMovimiento.INGRESO,
            Movimiento.fecha >= desde,
            Movimiento.fecha <= hasta,
        )
        .group_by(Movimiento.moneda)
    ).all()
    for moneda, monto in filas:
        totales[str(moneda)] += Decimal(monto)
    return totales


def _reservas_del_mes(db: Session, usuario: Usuario, desde: date, hasta: date) -> int:
    """Reservas (no canceladas) cuya estadía comienza en el período."""
    return (
        db.scalar(
            select(func.count(Reserva.id)).where(
                Reserva.id_usuario == usuario.id,
                Reserva.estado != EstadoReserva.CANCELADO,
                Reserva.fecha_ingreso >= desde,
                Reserva.fecha_ingreso <= hasta,
            )
        )
        or 0
    )


@router.get("/resumen")
def resumen_dashboard(
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoy = date.today()
    desde = hoy.replace(day=1)
    hasta = finanzas.fin_de_mes(hoy)
    ant_desde, ant_hasta = finanzas.periodo_anterior(desde, hasta)
    tc = finanzas.tipo_cambio_actual(db, usuario)

    reservas_mes = _reservas_del_mes(db, usuario, desde, hasta)
    reservas_ant = _reservas_del_mes(db, usuario, ant_desde, ant_hasta)

    ocupacion = finanzas.ocupacion_promedio(db, usuario, desde, hasta)
    ocupacion_ant = finanzas.ocupacion_promedio(db, usuario, ant_desde, ant_hasta)

    ingresos = _ingresos_por_moneda(db, usuario, desde, hasta)
    ingresos_ant = _ingresos_por_moneda(db, usuario, ant_desde, ant_hasta)

    pendiente_ars, _ = finanzas.pendiente_cobro(db, usuario)

    ingresos_total_ars = finanzas.ingresos_periodo_ars(db, usuario, desde, hasta, tc)
    egresos_total_ars = finanzas.egresos_periodo_ars(db, usuario, desde, hasta, tc)
    balance_positivo = ingresos_total_ars >= egresos_total_ars
    if ingresos_total_ars == 0 and egresos_total_ars == 0:
        balance_detalle = "Sin movimientos en el mes"
    elif egresos_total_ars == 0:
        balance_detalle = "Sin egresos registrados en el mes"
    elif balance_positivo:
        pct = finanzas.variacion(ingresos_total_ars, egresos_total_ars)
        balance_detalle = f"Ingresos superan egresos por {pct}%"
    else:
        pct = finanzas.variacion(egresos_total_ars, ingresos_total_ars)
        balance_detalle = f"Egresos superan ingresos por {pct}%"

    proximas = db.scalars(
        select(Reserva)
        .options(joinedload(Reserva.departamento))
        .where(
            Reserva.id_usuario == usuario.id,
            Reserva.estado != EstadoReserva.CANCELADO,
            Reserva.fecha_egreso > hoy,
        )
        .order_by(Reserva.fecha_ingreso.asc(), Reserva.id.asc())
        .limit(5)
    ).all()

    def fecha_corta(dia: date) -> str:
        return f"{dia.day} {finanzas.MESES_ABREV[dia.month - 1]}"

    return {
        "kpis": {
            "reservas_mes": reservas_mes,
            "reservas_var": finanzas.variacion(reservas_mes, reservas_ant),
            "ocupacion": ocupacion,
            "ocupacion_var": ocupacion - ocupacion_ant,
            "ingresos_ars": float(ingresos["ARS"]),
            "ingresos_ars_var": finanzas.variacion(ingresos["ARS"], ingresos_ant["ARS"]),
            "ingresos_usd": float(ingresos["USD"]),
            "ingresos_usd_var": finanzas.variacion(ingresos["USD"], ingresos_ant["USD"]),
            "pendiente_cobro": float(pendiente_ars),
            "pendiente_var": 0,  # el pendiente es una foto actual, no admite comparación histórica
            "balance_positivo": balance_positivo,
            "balance_detalle": balance_detalle,
        },
        "flujo_caja": finanzas.serie_mensual(db, usuario, hoy, 6, tc),
        "proximos_checkins": [
            {
                "id": r.id,
                "cliente": r.cliente,
                "departamento": r.departamento.nombre if r.departamento else "-",
                "check_in": fecha_corta(r.fecha_ingreso),
                "check_out": fecha_corta(r.fecha_egreso),
                "estado": ESTADO_LABELS.get(r.estado, r.estado.value),
            }
            for r in proximas
        ],
    }
