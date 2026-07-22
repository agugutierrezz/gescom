"""Cálculos del módulo financiero (RF-14): KPIs, ocupación y cierre de período.

Criterio de moneda: todos los KPIs se expresan en ARS.
- Pagos de reservas en USD se convierten con el tipo de cambio de su reserva
  (trazabilidad histórica).
- Movimientos en USD se convierten con la cotización actual (venta); si la API
  no responde se usa el tipo de cambio de la última reserva como fallback.

Ingresos del período = pagos de reservas (tipo PAGO) + movimientos INGRESO.
Egresos del período = movimientos EGRESO.
"""

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.models.departamento import Departamento
from app.models.movimiento import Movimiento, TipoMovimiento
from app.models.pago import Moneda, Pago, TipoPago
from app.models.reserva import EstadoReserva, Reserva
from app.models.usuario import Usuario
from app.services.cuenta_corriente import saldo_usd
from app.services.tipo_cambio import obtener_cotizacion

DOS_DECIMALES = Decimal("0.01")

MESES_ABREV = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
MESES_LARGO = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def _q2(valor: Decimal) -> Decimal:
    return Decimal(valor).quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP)


def tipo_cambio_actual(db: Session, usuario: Usuario) -> Decimal:
    """Cotización venta actual; si falla, el tipo de cambio de la última reserva; si no, 1."""
    try:
        return Decimal(str(obtener_cotizacion()["venta"]))
    except Exception:
        ultimo = db.scalar(
            select(Reserva.tipo_cambio)
            .where(Reserva.id_usuario == usuario.id)
            .order_by(Reserva.created_at.desc())
            .limit(1)
        )
        return Decimal(ultimo) if ultimo else Decimal("1")


def ingresos_reservas_ars(db: Session, usuario: Usuario, desde: date, hasta: date) -> Decimal:
    """Cobros de reservas (pagos tipo PAGO) del período, en ARS."""
    total = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (Pago.moneda == Moneda.ARS, Pago.monto_final),
                        else_=Pago.monto_final * Reserva.tipo_cambio,
                    )
                ),
                0,
            )
        )
        .join(Reserva, Pago.id_reserva == Reserva.id)
        .where(
            Reserva.id_usuario == usuario.id,
            Pago.tipo == TipoPago.PAGO,
            Pago.fecha_pago >= desde,
            Pago.fecha_pago <= hasta,
        )
    )
    return _q2(total)


def movimientos_ars(
    db: Session,
    usuario: Usuario,
    desde: date,
    hasta: date,
    tipo: TipoMovimiento,
    tc: Decimal,
) -> Decimal:
    """Total de movimientos del tipo dado en el período, convertido a ARS."""
    filas = db.execute(
        select(Movimiento.moneda, func.coalesce(func.sum(Movimiento.monto), 0))
        .where(
            Movimiento.id_usuario == usuario.id,
            Movimiento.tipo == tipo,
            Movimiento.fecha >= desde,
            Movimiento.fecha <= hasta,
        )
        .group_by(Movimiento.moneda)
    ).all()
    total = Decimal("0")
    for moneda, monto in filas:
        monto = Decimal(monto)
        total += monto * tc if moneda == "USD" else monto
    return _q2(total)


def ingresos_periodo_ars(db: Session, usuario: Usuario, desde: date, hasta: date, tc: Decimal) -> Decimal:
    return _q2(
        ingresos_reservas_ars(db, usuario, desde, hasta)
        + movimientos_ars(db, usuario, desde, hasta, TipoMovimiento.INGRESO, tc)
    )


def egresos_periodo_ars(db: Session, usuario: Usuario, desde: date, hasta: date, tc: Decimal) -> Decimal:
    return movimientos_ars(db, usuario, desde, hasta, TipoMovimiento.EGRESO, tc)


def pendiente_cobro(db: Session, usuario: Usuario) -> tuple[Decimal, Decimal]:
    """Saldos pendientes de reservas no canceladas: (total ARS, total USD)."""
    reservas = db.scalars(
        select(Reserva)
        .options(selectinload(Reserva.pagos))
        .where(Reserva.id_usuario == usuario.id, Reserva.estado != EstadoReserva.CANCELADO)
    ).all()
    total_usd = Decimal("0")
    total_ars = Decimal("0")
    for reserva in reservas:
        saldo = saldo_usd(reserva)
        if saldo > 0:
            total_usd += saldo
            total_ars += saldo * Decimal(reserva.tipo_cambio)
    return _q2(total_ars), _q2(total_usd)


def _noches_en_periodo(reserva: Reserva, desde: date, hasta: date) -> int:
    """Noches de la estadía [ingreso, egreso) que caen dentro de [desde, hasta]."""
    inicio = max(reserva.fecha_ingreso, desde)
    fin = min(reserva.fecha_egreso, hasta + timedelta(days=1))
    return max(0, (fin - inicio).days)


def ocupacion_por_unidad(db: Session, usuario: Usuario, desde: date, hasta: date) -> dict:
    """Reporte de ocupación por departamento en el período."""
    dias = (hasta - desde).days + 1
    departamentos = db.scalars(
        select(Departamento).where(Departamento.id_usuario == usuario.id).order_by(Departamento.nombre)
    ).all()
    reservas = db.scalars(
        select(Reserva).where(
            Reserva.id_usuario == usuario.id,
            Reserva.estado != EstadoReserva.CANCELADO,
            Reserva.fecha_ingreso <= hasta,
            Reserva.fecha_egreso > desde,
        )
    ).all()

    # Ingresos cobrados en el período, agrupados por departamento (en ARS).
    ingresos_por_depto = dict(
        db.execute(
            select(
                Reserva.id_departamento,
                func.coalesce(
                    func.sum(
                        case(
                            (Pago.moneda == Moneda.ARS, Pago.monto_final),
                            else_=Pago.monto_final * Reserva.tipo_cambio,
                        )
                    ),
                    0,
                ),
            )
            .join(Reserva, Pago.id_reserva == Reserva.id)
            .where(
                Reserva.id_usuario == usuario.id,
                Pago.tipo == TipoPago.PAGO,
                Pago.fecha_pago >= desde,
                Pago.fecha_pago <= hasta,
            )
            .group_by(Reserva.id_departamento)
        ).all()
    )

    noches_por_depto: dict[int, int] = {}
    reservas_por_depto: dict[int, int] = {}
    for reserva in reservas:
        noches = _noches_en_periodo(reserva, desde, hasta)
        if noches <= 0:
            continue
        noches_por_depto[reserva.id_departamento] = (
            noches_por_depto.get(reserva.id_departamento, 0) + noches
        )
        reservas_por_depto[reserva.id_departamento] = (
            reservas_por_depto.get(reserva.id_departamento, 0) + 1
        )

    unidades = []
    for depto in departamentos:
        noches = noches_por_depto.get(depto.id, 0)
        if not depto.activo and noches == 0:
            continue  # unidades dadas de baja sin actividad no suman al reporte
        porcentaje = round(noches * 100 / dias) if dias > 0 else 0
        unidades.append(
            {
                "id": depto.id,
                "nombre": depto.nombre,
                "activo": depto.activo,
                "noches_ocupadas": noches,
                "noches_disponibles": dias,
                "porcentaje": min(100, porcentaje),
                "reservas": reservas_por_depto.get(depto.id, 0),
                "ingresos_ars": float(_q2(ingresos_por_depto.get(depto.id, 0))),
            }
        )

    activos = [u for u in unidades if u["activo"]]
    total_noches = sum(u["noches_ocupadas"] for u in unidades)
    capacidad = dias * len(activos)
    promedio = round(min(100, total_noches * 100 / capacidad)) if capacidad > 0 else 0
    return {
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "dias": dias,
        "unidades_activas": len(activos),
        "ocupacion_promedio": promedio,
        "noches_ocupadas": total_noches,
        "unidades": unidades,
    }


def ocupacion_promedio(db: Session, usuario: Usuario, desde: date, hasta: date) -> int:
    return ocupacion_por_unidad(db, usuario, desde, hasta)["ocupacion_promedio"]


def variacion(actual: Decimal | int, anterior: Decimal | int) -> int:
    """Variación porcentual redondeada respecto del período anterior."""
    actual, anterior = Decimal(actual), Decimal(anterior)
    if anterior == 0:
        return 0 if actual == 0 else 100
    return int(round((actual - anterior) * 100 / anterior))


def periodo_anterior(desde: date, hasta: date) -> tuple[date, date]:
    """Período inmediatamente anterior, de la misma longitud (o mes calendario previo)."""
    if desde.day == 1 and hasta == fin_de_mes(desde) and desde.month == hasta.month:
        previo = desde - timedelta(days=1)
        return previo.replace(day=1), previo
    dias = (hasta - desde).days + 1
    return desde - timedelta(days=dias), desde - timedelta(days=1)


def fin_de_mes(dia: date) -> date:
    return dia.replace(day=monthrange(dia.year, dia.month)[1])


def serie_mensual(db: Session, usuario: Usuario, hasta: date, meses: int, tc: Decimal) -> list[dict]:
    """Ingresos vs egresos (ARS) por mes, para los últimos `meses` meses hasta `hasta`."""
    serie = []
    anio, mes = hasta.year, hasta.month
    puntos = []
    for _ in range(meses):
        puntos.append((anio, mes))
        mes -= 1
        if mes == 0:
            mes, anio = 12, anio - 1
    for anio_p, mes_p in reversed(puntos):
        inicio = date(anio_p, mes_p, 1)
        fin = fin_de_mes(inicio)
        serie.append(
            {
                "mes": MESES_ABREV[mes_p - 1],
                "anio": anio_p,
                "ingresos": float(ingresos_periodo_ars(db, usuario, inicio, fin, tc)),
                "egresos": float(egresos_periodo_ars(db, usuario, inicio, fin, tc)),
            }
        )
    return serie


def resumen_financiero(db: Session, usuario: Usuario, desde: date, hasta: date) -> dict:
    """KPIs del dashboard financiero (RF-14) para el período dado."""
    tc = tipo_cambio_actual(db, usuario)
    ingresos = ingresos_periodo_ars(db, usuario, desde, hasta, tc)
    egresos = egresos_periodo_ars(db, usuario, desde, hasta, tc)
    ant_desde, ant_hasta = periodo_anterior(desde, hasta)
    ingresos_ant = ingresos_periodo_ars(db, usuario, ant_desde, ant_hasta, tc)
    egresos_ant = egresos_periodo_ars(db, usuario, ant_desde, ant_hasta, tc)

    ocupacion = ocupacion_por_unidad(db, usuario, desde, hasta)
    ocupacion_ant = ocupacion_promedio(db, usuario, ant_desde, ant_hasta)
    pendiente_ars, pendiente_usd = pendiente_cobro(db, usuario)

    inicio_anio = date(hasta.year, 1, 1)
    ingresos_anio = ingresos_periodo_ars(db, usuario, inicio_anio, hasta, tc)

    return {
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "tipo_cambio": float(tc),
        "kpis": {
            "ingresos_ars": float(ingresos),
            "ingresos_var": variacion(ingresos, ingresos_ant),
            "egresos_ars": float(egresos),
            "egresos_var": variacion(egresos, egresos_ant),
            "balance_ars": float(_q2(ingresos - egresos)),
            "ocupacion": ocupacion["ocupacion_promedio"],
            "ocupacion_var": ocupacion["ocupacion_promedio"] - ocupacion_ant,
            "unidades_activas": ocupacion["unidades_activas"],
            "pendiente_cobro_ars": float(pendiente_ars),
            "pendiente_cobro_usd": float(pendiente_usd),
            "ingresos_anio_ars": float(ingresos_anio),
        },
        "serie": serie_mensual(db, usuario, hasta, 6, tc),
    }


def transacciones(
    db: Session,
    usuario: Usuario,
    desde: date,
    hasta: date,
    tc: Decimal,
    tipo: TipoMovimiento | None = None,
    q: str | None = None,
    categoria: str | None = None,
    departamento_id: int | None = None,
) -> list[dict]:
    """Listado unificado del período: cobros de reservas + movimientos operativos.

    Los cobros de reservas son de solo lectura (origen PAGO_RESERVA); los
    movimientos (origen MOVIMIENTO) se editan vía /movimientos.
    """
    filas: list[dict] = []

    incluir_pagos = tipo is None or tipo == TipoMovimiento.INGRESO
    if incluir_pagos and (categoria is None or categoria.strip().lower() == "alojamiento"):
        query = (
            select(Pago, Reserva)
            .join(Reserva, Pago.id_reserva == Reserva.id)
            .options(selectinload(Reserva.departamento))
            .where(
                Reserva.id_usuario == usuario.id,
                Pago.tipo == TipoPago.PAGO,
                Pago.fecha_pago >= desde,
                Pago.fecha_pago <= hasta,
            )
        )
        if departamento_id is not None:
            query = query.where(Reserva.id_departamento == departamento_id)
        for pago, reserva in db.execute(query).all():
            descripcion = f"Pago Reserva #{reserva.id} — {reserva.cliente}"
            if pago.concepto and pago.concepto.lower() not in ("pago",):
                descripcion += f" ({pago.concepto})"
            if q and q.strip().lower() not in descripcion.lower():
                continue
            monto = Decimal(pago.monto_final)
            monto_ars = monto if pago.moneda == Moneda.ARS else monto * Decimal(reserva.tipo_cambio)
            filas.append(
                {
                    "id": f"pago-{pago.id}",
                    "origen": "PAGO_RESERVA",
                    "id_reserva": reserva.id,
                    "fecha": pago.fecha_pago.isoformat(),
                    "descripcion": descripcion,
                    "tipo": "INGRESO",
                    "categoria": "Alojamiento",
                    "departamento": reserva.departamento.nombre if reserva.departamento else None,
                    "monto": float(monto),
                    "moneda": pago.moneda.value,
                    "monto_ars": float(_q2(monto_ars)),
                }
            )

    query = (
        select(Movimiento)
        .options(selectinload(Movimiento.departamento))
        .where(
            Movimiento.id_usuario == usuario.id,
            Movimiento.fecha >= desde,
            Movimiento.fecha <= hasta,
        )
    )
    if tipo is not None:
        query = query.where(Movimiento.tipo == tipo)
    if q:
        query = query.where(Movimiento.descripcion.ilike(f"%{q.strip()}%"))
    if categoria:
        query = query.where(Movimiento.categoria.ilike(categoria.strip()))
    if departamento_id is not None:
        query = query.where(Movimiento.id_departamento == departamento_id)
    for mov in db.scalars(query).all():
        monto = Decimal(mov.monto)
        monto_ars = monto * tc if mov.moneda == "USD" else monto
        filas.append(
            {
                "id": f"mov-{mov.id}",
                "origen": "MOVIMIENTO",
                "id_movimiento": mov.id,
                "id_departamento": mov.id_departamento,
                "fecha": mov.fecha.isoformat(),
                "descripcion": mov.descripcion,
                "tipo": mov.tipo.value,
                "categoria": mov.categoria,
                "departamento": mov.departamento.nombre if mov.departamento else None,
                "monto": float(monto),
                "moneda": mov.moneda,
                "monto_ars": float(_q2(monto_ars)),
            }
        )

    filas.sort(key=lambda f: (f["fecha"], f["id"]), reverse=True)
    return filas


def _movimientos_por_categoria(
    db: Session, usuario: Usuario, desde: date, hasta: date, tipo: TipoMovimiento, tc: Decimal
) -> list[dict]:
    filas = db.execute(
        select(
            func.coalesce(Movimiento.categoria, "Sin categoría"),
            Movimiento.moneda,
            func.coalesce(func.sum(Movimiento.monto), 0),
        )
        .where(
            Movimiento.id_usuario == usuario.id,
            Movimiento.tipo == tipo,
            Movimiento.fecha >= desde,
            Movimiento.fecha <= hasta,
        )
        .group_by(Movimiento.categoria, Movimiento.moneda)
    ).all()
    por_categoria: dict[str, Decimal] = {}
    for categoria, moneda, monto in filas:
        monto = Decimal(monto)
        if moneda == "USD":
            monto *= tc
        por_categoria[categoria] = por_categoria.get(categoria, Decimal("0")) + monto
    return [
        {"categoria": categoria, "total_ars": float(_q2(total))}
        for categoria, total in sorted(por_categoria.items(), key=lambda kv: -kv[1])
    ]


def cierre_periodo(db: Session, usuario: Usuario, anio: int, mes: int | None) -> dict:
    """Cierre mensual (anio+mes) o anual (solo anio): totales por origen y categoría."""
    if mes is not None:
        desde = date(anio, mes, 1)
        hasta = fin_de_mes(desde)
        etiqueta = f"{MESES_LARGO[mes - 1]} {anio}"
    else:
        desde = date(anio, 1, 1)
        hasta = date(anio, 12, 31)
        etiqueta = f"Año {anio}"
    tc = tipo_cambio_actual(db, usuario)
    return desglose_periodo(db, usuario, desde, hasta, tc, etiqueta)


def desglose_periodo(
    db: Session,
    usuario: Usuario,
    desde: date,
    hasta: date,
    tc: Decimal,
    etiqueta: str | None = None,
) -> dict:
    """Totales por origen y categoría para un período arbitrario."""
    etiqueta = etiqueta or f"{desde:%d/%m/%Y} al {hasta:%d/%m/%Y}"
    cobros = ingresos_reservas_ars(db, usuario, desde, hasta)
    ingresos_mov = _movimientos_por_categoria(db, usuario, desde, hasta, TipoMovimiento.INGRESO, tc)
    egresos_mov = _movimientos_por_categoria(db, usuario, desde, hasta, TipoMovimiento.EGRESO, tc)
    total_ingresos = _q2(cobros + Decimal(str(sum(i["total_ars"] for i in ingresos_mov))))
    total_egresos = _q2(Decimal(str(sum(e["total_ars"] for e in egresos_mov))))
    ocupacion = ocupacion_por_unidad(db, usuario, desde, hasta)

    reservas_periodo = db.scalar(
        select(func.count(Reserva.id)).where(
            Reserva.id_usuario == usuario.id,
            Reserva.estado != EstadoReserva.CANCELADO,
            Reserva.fecha_ingreso <= hasta,
            Reserva.fecha_egreso > desde,
        )
    )

    return {
        "periodo": etiqueta,
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "tipo_cambio": float(tc),
        "ingresos": {
            "cobros_reservas_ars": float(cobros),
            "movimientos": ingresos_mov,
            "total_ars": float(total_ingresos),
        },
        "egresos": {
            "movimientos": egresos_mov,
            "total_ars": float(total_egresos),
        },
        "balance_ars": float(_q2(total_ingresos - total_egresos)),
        "ocupacion_promedio": ocupacion["ocupacion_promedio"],
        "noches_ocupadas": ocupacion["noches_ocupadas"],
        "reservas": reservas_periodo or 0,
    }
