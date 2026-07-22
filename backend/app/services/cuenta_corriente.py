"""Cálculos de cuenta corriente de una reserva (nada se persiste).

Total neto = monto - descuento + cargos. Saldo = total neto - pagos.
Los movimientos en ARS se convierten con el tipo de cambio de la reserva.
El descuento tipo MONTO se expresa en USD.
"""

from decimal import Decimal, ROUND_HALF_UP

from app.models.pago import Moneda, TipoPago
from app.models.reserva import DescuentoTipo, Reserva

DOS_DECIMALES = Decimal("0.01")
EPS = Decimal("0.01")  # tolerancia por redondeos de conversión


def _en_usd(monto, moneda: Moneda, tipo_cambio) -> Decimal:
    monto = Decimal(monto)
    if moneda == Moneda.ARS:
        monto = monto / Decimal(tipo_cambio)
    return monto


def descuento_usd(reserva: Reserva) -> Decimal:
    """Descuento de la reserva expresado en USD."""
    if reserva.descuento_tipo is None or reserva.descuento_valor is None:
        return Decimal("0")
    valor = Decimal(reserva.descuento_valor)
    if reserva.descuento_tipo == DescuentoTipo.PORCENTAJE:
        bruto = Decimal(reserva.monto_usd) * valor / Decimal("100")
    else:  # MONTO, en USD
        bruto = valor
    return bruto.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP)


def total_neto_usd(reserva: Reserva) -> Decimal:
    """Total a cobrar: monto - descuento + cargos de cuenta corriente."""
    total = Decimal(reserva.monto_usd) - descuento_usd(reserva)
    for pago in reserva.pagos:
        if pago.tipo == TipoPago.CARGO:
            total += _en_usd(pago.monto_final, pago.moneda, reserva.tipo_cambio)
    return total.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP)


def total_pagado_usd(reserva: Reserva) -> Decimal:
    """Suma de pagos (tipo PAGO) en USD."""
    total = Decimal("0")
    for pago in reserva.pagos:
        if pago.tipo == TipoPago.PAGO:
            total += _en_usd(pago.monto_final, pago.moneda, reserva.tipo_cambio)
    return total.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP)


def saldo_usd(reserva: Reserva) -> Decimal:
    return total_neto_usd(reserva) - total_pagado_usd(reserva)
