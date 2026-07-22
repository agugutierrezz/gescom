from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.pago import Moneda, TipoPago
from app.models.reserva import DescuentoTipo, EstadoReserva


class ReservaBase(BaseModel):
    cliente: str = Field(min_length=1, max_length=255)
    id_departamento: int
    fecha_ingreso: date
    fecha_egreso: date
    monto: Decimal = Field(gt=0, description="Monto de la reserva en la moneda indicada")
    moneda: Moneda = Moneda.USD
    tipo_cambio: Decimal = Field(gt=0, description="Cotización ARS/USD usada para el cálculo")
    descuento_tipo: DescuentoTipo | None = None
    descuento_valor: Decimal | None = Field(default=None, gt=0, description="Si es MONTO, en USD")
    observaciones: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validar(self):
        if self.fecha_egreso <= self.fecha_ingreso:
            raise ValueError("La fecha de egreso debe ser posterior a la de ingreso")
        if (self.descuento_tipo is None) != (self.descuento_valor is None):
            raise ValueError("El descuento requiere tipo y valor")
        if self.descuento_tipo == DescuentoTipo.PORCENTAJE and self.descuento_valor > 100:
            raise ValueError("El descuento porcentual no puede superar el 100%")
        return self


class ReservaCreate(ReservaBase):
    sena: Decimal | None = Field(default=None, ge=0, description="Seña, en la moneda de sena_moneda")
    sena_moneda: Moneda = Moneda.ARS
    sena_medio_pago: str | None = Field(default=None, max_length=50)


class ReservaUpdate(ReservaBase):
    pass


class ReservaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente: str
    id_departamento: int
    departamento_nombre: str | None = None
    fecha_ingreso: date
    fecha_egreso: date
    monto_usd: Decimal
    monto_pesos: Decimal
    tipo_cambio: Decimal
    descuento_tipo: DescuentoTipo | None
    descuento_valor: Decimal | None
    estado: EstadoReserva
    observaciones: str | None
    created_at: datetime
    # Calculados (no persistidos)
    descuento_usd: Decimal = Decimal("0")
    total_usd: Decimal = Decimal("0")
    total_pesos: Decimal = Decimal("0")
    total_pagado_usd: Decimal = Decimal("0")
    saldo_usd: Decimal = Decimal("0")
    saldo_pesos: Decimal = Decimal("0")


class PagoCreate(BaseModel):
    fecha_pago: date
    monto: Decimal = Field(gt=0)
    moneda: Moneda = Moneda.USD
    medio_pago: str | None = Field(default=None, max_length=50)
    concepto: str | None = Field(default=None, max_length=255)
    permitir_excedente: bool = False


class CancelacionReserva(BaseModel):
    """Body opcional de la cancelación: devolución de dinero al cliente.

    Si se indica un monto, se genera un movimiento EGRESO (categoría
    "Devolución") con la fecha de hoy y el departamento de la reserva.
    """

    devolucion_monto: Decimal | None = Field(default=None, gt=0)
    devolucion_moneda: Moneda = Moneda.ARS


class PagoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tipo: TipoPago
    concepto: str | None
    fecha_pago: date
    moneda: Moneda
    medio_pago: str | None
    monto_final: Decimal
    created_at: datetime


class CotizacionOut(BaseModel):
    casa: str
    nombre: str
    compra: float
    venta: float
    fecha_actualizacion: str
