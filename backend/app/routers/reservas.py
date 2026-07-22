from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models.departamento import Departamento
from app.models.movimiento import Movimiento, TipoMovimiento
from app.models.pago import Moneda, Pago, TipoPago
from app.models.reserva import DescuentoTipo, EstadoReserva, Reserva
from app.models.usuario import Usuario
from app.routers.deps import get_current_user
from app.schemas.reserva import (
    CancelacionReserva,
    CotizacionOut,
    PagoCreate,
    PagoOut,
    ReservaCreate,
    ReservaOut,
    ReservaUpdate,
)
from app.services.cuenta_corriente import (
    DOS_DECIMALES,
    EPS,
    descuento_usd,
    saldo_usd,
    total_neto_usd,
    total_pagado_usd,
)
from app.services.pdf_reserva import generar_pdf_reserva
from app.services.tipo_cambio import obtener_cotizacion

router = APIRouter(prefix="/reservas", tags=["reservas"])
cotizacion_router = APIRouter(prefix="/tipo-cambio", tags=["tipo-cambio"])


@cotizacion_router.get("", response_model=CotizacionOut)
def tipo_cambio_actual(usuario: Usuario = Depends(get_current_user)):
    """Cotización del dólar oficial (dolarapi.com). Se usa el valor venta."""
    return obtener_cotizacion()


def _get_reserva_propia(db: Session, usuario: Usuario, reserva_id: int) -> Reserva:
    reserva = db.get(Reserva, reserva_id, options=[joinedload(Reserva.departamento)])
    if reserva is None or reserva.id_usuario != usuario.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    return reserva


def _get_departamento_activo(db: Session, usuario: Usuario, departamento_id: int) -> Departamento:
    departamento = db.get(Departamento, departamento_id)
    if departamento is None or departamento.id_usuario != usuario.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Departamento no encontrado"
        )
    if not departamento.activo:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El departamento está inactivo, no admite nuevas reservas",
        )
    return departamento


def _validar_disponibilidad(
    db: Session,
    departamento_id: int,
    fecha_ingreso: date,
    fecha_egreso: date,
    excluir_reserva_id: int | None = None,
) -> None:
    """Rechaza solapamiento de fechas con otra reserva no cancelada del mismo departamento."""
    query = select(Reserva).where(
        Reserva.id_departamento == departamento_id,
        Reserva.estado != EstadoReserva.CANCELADO,
        Reserva.fecha_ingreso < fecha_egreso,
        Reserva.fecha_egreso > fecha_ingreso,
    )
    if excluir_reserva_id is not None:
        query = query.where(Reserva.id != excluir_reserva_id)
    solapada = db.scalar(query)
    if solapada is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"El departamento ya tiene una reserva de {solapada.cliente} "
                f"entre {solapada.fecha_ingreso:%d/%m/%Y} y {solapada.fecha_egreso:%d/%m/%Y}"
            ),
        )


def _calcular_montos(monto: Decimal, moneda: Moneda, tipo_cambio: Decimal) -> tuple[Decimal, Decimal]:
    """Devuelve (monto_usd, monto_pesos) redondeados a 2 decimales."""
    if moneda == Moneda.USD:
        monto_usd = monto
        monto_pesos = monto * tipo_cambio
    else:
        monto_pesos = monto
        monto_usd = monto / tipo_cambio
    return (
        monto_usd.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP),
        monto_pesos.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP),
    )


def _recalcular_estado(reserva: Reserva) -> None:
    """Actualiza el estado según el saldo. No toca reservas canceladas."""
    if reserva.estado == EstadoReserva.CANCELADO:
        return
    pagado = total_pagado_usd(reserva)
    if saldo_usd(reserva) <= EPS:
        reserva.estado = EstadoReserva.PAGADO
    elif pagado > 0:
        reserva.estado = EstadoReserva.PARCIAL
    else:
        reserva.estado = EstadoReserva.PENDIENTE


def _validar_descuento(payload, monto_usd: Decimal) -> None:
    if payload.descuento_tipo == DescuentoTipo.MONTO and payload.descuento_valor > monto_usd:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El descuento no puede superar el monto de la reserva",
        )


def _a_out(reserva: Reserva) -> ReservaOut:
    out = ReservaOut.model_validate(reserva)
    out.departamento_nombre = reserva.departamento.nombre if reserva.departamento else None
    tc = Decimal(reserva.tipo_cambio)
    out.descuento_usd = descuento_usd(reserva)
    out.total_usd = total_neto_usd(reserva)
    out.total_pesos = (out.total_usd * tc).quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP)
    out.total_pagado_usd = total_pagado_usd(reserva)
    out.saldo_usd = max(Decimal("0"), saldo_usd(reserva))
    out.saldo_pesos = (out.saldo_usd * tc).quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP)
    return out


@router.get("", response_model=list[ReservaOut])
def listar_reservas(
    q: str | None = None,
    departamento_id: int | None = None,
    estado: EstadoReserva | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Consulta avanzada: cliente (q), departamento, estado y rango de fechas de estadía."""
    query = (
        select(Reserva)
        .options(joinedload(Reserva.departamento))
        .where(Reserva.id_usuario == usuario.id)
    )
    if q:
        query = query.where(Reserva.cliente.ilike(f"%{q.strip()}%"))
    if departamento_id is not None:
        query = query.where(Reserva.id_departamento == departamento_id)
    if estado is not None:
        query = query.where(Reserva.estado == estado)
    if fecha_desde is not None:
        query = query.where(Reserva.fecha_egreso >= fecha_desde)
    if fecha_hasta is not None:
        query = query.where(Reserva.fecha_ingreso <= fecha_hasta)
    query = query.order_by(Reserva.fecha_ingreso.desc(), Reserva.id.desc())
    return [_a_out(r) for r in db.scalars(query).all()]


@router.get("/{reserva_id}", response_model=ReservaOut)
def obtener_reserva(
    reserva_id: int,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _a_out(_get_reserva_propia(db, usuario, reserva_id))


@router.post("", response_model=ReservaOut, status_code=status.HTTP_201_CREATED)
def crear_reserva(
    payload: ReservaCreate,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_departamento_activo(db, usuario, payload.id_departamento)
    _validar_disponibilidad(db, payload.id_departamento, payload.fecha_ingreso, payload.fecha_egreso)

    monto_usd, monto_pesos = _calcular_montos(payload.monto, payload.moneda, payload.tipo_cambio)
    _validar_descuento(payload, monto_usd)

    reserva = Reserva(
        id_usuario=usuario.id,
        cliente=payload.cliente.strip(),
        id_departamento=payload.id_departamento,
        fecha_ingreso=payload.fecha_ingreso,
        fecha_egreso=payload.fecha_egreso,
        monto_usd=monto_usd,
        monto_pesos=monto_pesos,
        tipo_cambio=payload.tipo_cambio,
        descuento_tipo=payload.descuento_tipo,
        descuento_valor=payload.descuento_valor,
        estado=EstadoReserva.PENDIENTE,
        observaciones=payload.observaciones,
    )
    db.add(reserva)
    db.flush()

    if payload.sena is not None and payload.sena > 0:
        # La seña tiene moneda propia (independiente de la moneda del monto).
        sena_usd = (
            payload.sena if payload.sena_moneda == Moneda.USD else payload.sena / payload.tipo_cambio
        )
        if sena_usd - total_neto_usd(reserva) > EPS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="La seña no puede superar el total de la reserva (con descuento aplicado)",
            )
        sena = payload.sena.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP)
        db.add(
            Pago(
                id_reserva=reserva.id,
                tipo=TipoPago.PAGO,
                concepto="Seña",
                fecha_pago=date.today(),
                monto_original=sena,
                moneda=payload.sena_moneda,
                medio_pago=payload.sena_medio_pago,
                monto_final=sena,
            )
        )
        db.flush()
        db.refresh(reserva)

    _recalcular_estado(reserva)
    db.commit()
    db.refresh(reserva)
    return _a_out(reserva)


@router.put("/{reserva_id}", response_model=ReservaOut)
def actualizar_reserva(
    reserva_id: int,
    payload: ReservaUpdate,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reserva = _get_reserva_propia(db, usuario, reserva_id)
    if reserva.estado == EstadoReserva.CANCELADO:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede editar una reserva cancelada",
        )
    if payload.id_departamento != reserva.id_departamento:
        _get_departamento_activo(db, usuario, payload.id_departamento)
    _validar_disponibilidad(
        db,
        payload.id_departamento,
        payload.fecha_ingreso,
        payload.fecha_egreso,
        excluir_reserva_id=reserva.id,
    )

    monto_usd, monto_pesos = _calcular_montos(payload.monto, payload.moneda, payload.tipo_cambio)
    _validar_descuento(payload, monto_usd)

    reserva.cliente = payload.cliente.strip()
    reserva.id_departamento = payload.id_departamento
    reserva.fecha_ingreso = payload.fecha_ingreso
    reserva.fecha_egreso = payload.fecha_egreso
    reserva.monto_usd = monto_usd
    reserva.monto_pesos = monto_pesos
    reserva.tipo_cambio = payload.tipo_cambio
    reserva.descuento_tipo = payload.descuento_tipo
    reserva.descuento_valor = payload.descuento_valor
    reserva.observaciones = payload.observaciones
    _recalcular_estado(reserva)

    db.commit()
    db.refresh(reserva)
    return _a_out(reserva)


@router.patch("/{reserva_id}/cancelar", response_model=ReservaOut)
def cancelar_reserva(
    reserva_id: int,
    payload: CancelacionReserva | None = None,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancelación (baja lógica): la reserva queda CANCELADO y libera las fechas.

    Si el body incluye devolucion_monto, se registra además un movimiento
    EGRESO "Devolución" (fecha de hoy, departamento de la reserva), para que
    el flujo de caja refleje la plata devuelta al cliente.
    """
    reserva = _get_reserva_propia(db, usuario, reserva_id)
    if reserva.estado == EstadoReserva.CANCELADO:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="La reserva ya está cancelada"
        )
    reserva.estado = EstadoReserva.CANCELADO

    if payload is not None and payload.devolucion_monto is not None:
        db.add(
            Movimiento(
                id_usuario=usuario.id,
                fecha=date.today(),
                descripcion=f"Devolución reserva #{reserva.id} — {reserva.cliente}",
                tipo=TipoMovimiento.EGRESO,
                categoria="Devolución",
                id_departamento=reserva.id_departamento,
                monto=payload.devolucion_monto.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP),
                moneda=payload.devolucion_moneda.value,
            )
        )

    db.commit()
    db.refresh(reserva)
    return _a_out(reserva)


@router.get("/{reserva_id}/pdf")
def descargar_pdf_reserva(
    reserva_id: int,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reserva = _get_reserva_propia(db, usuario, reserva_id)
    contenido = generar_pdf_reserva(reserva)
    return Response(
        content=contenido,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="reserva_{reserva.id}.pdf"',
        },
    )


# ---------------------------------------------------------------------------
# CU02 — Registrar pago de reserva
# ---------------------------------------------------------------------------

@router.get("/{reserva_id}/pagos", response_model=list[PagoOut])
def listar_pagos(
    reserva_id: int,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reserva = _get_reserva_propia(db, usuario, reserva_id)
    return sorted(reserva.pagos, key=lambda p: (p.fecha_pago, p.id))


@router.post("/{reserva_id}/pagos", response_model=ReservaOut, status_code=status.HTTP_201_CREATED)
def registrar_pago(
    reserva_id: int,
    payload: PagoCreate,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """CU02: registra un pago y actualiza saldo/estado.

    Precondición: reserva no cancelada con saldo pendiente > 0.
    Flujo alternativo: si el monto supera el saldo se responde 409, salvo que
    el cliente confirme con permitir_excedente=true.
    Devuelve la reserva actualizada (con saldo y estado nuevos).
    """
    reserva = _get_reserva_propia(db, usuario, reserva_id)
    if reserva.estado == EstadoReserva.CANCELADO:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se pueden registrar pagos sobre una reserva cancelada",
        )

    saldo = saldo_usd(reserva)
    if saldo <= EPS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La reserva no tiene saldo pendiente",
        )

    monto = payload.monto.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP)
    monto_usd_equiv = monto if payload.moneda == Moneda.USD else monto / Decimal(reserva.tipo_cambio)
    if monto_usd_equiv - saldo > EPS and not payload.permitir_excedente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"EXCEDENTE: el pago supera el saldo pendiente "
                f"(saldo USD {saldo:.2f}, pago equivale a USD {monto_usd_equiv:.2f})"
            ),
        )

    db.add(
        Pago(
            id_reserva=reserva.id,
            tipo=TipoPago.PAGO,
            concepto=payload.concepto.strip() if payload.concepto else "Pago",
            fecha_pago=payload.fecha_pago,
            monto_original=monto,
            moneda=payload.moneda,
            medio_pago=payload.medio_pago,
            monto_final=monto,
        )
    )
    db.flush()
    db.refresh(reserva)
    _recalcular_estado(reserva)
    db.commit()
    db.refresh(reserva)
    return _a_out(reserva)


@router.delete("/{reserva_id}/pagos/{pago_id}", response_model=ReservaOut)
def eliminar_pago(
    reserva_id: int,
    pago_id: int,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Elimina un pago mal cargado y recalcula saldo/estado."""
    reserva = _get_reserva_propia(db, usuario, reserva_id)
    pago = db.get(Pago, pago_id)
    if pago is None or pago.id_reserva != reserva.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pago no encontrado")
    db.delete(pago)
    db.flush()
    db.refresh(reserva)
    _recalcular_estado(reserva)
    db.commit()
    db.refresh(reserva)
    return _a_out(reserva)
