from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.movimiento import TipoMovimiento
from app.models.pago import Moneda


class MovimientoBase(BaseModel):
    fecha: date
    descripcion: str = Field(min_length=1, max_length=2000)
    tipo: TipoMovimiento
    categoria: str | None = Field(default=None, max_length=100)
    id_departamento: int | None = None
    monto: Decimal = Field(gt=0)
    moneda: Moneda = Moneda.ARS


class MovimientoCreate(MovimientoBase):
    pass


class MovimientoUpdate(MovimientoBase):
    pass


class MovimientoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fecha: date
    descripcion: str
    tipo: TipoMovimiento
    categoria: str | None
    id_departamento: int | None
    departamento_nombre: str | None = None
    monto: Decimal
    moneda: str
    created_at: datetime
