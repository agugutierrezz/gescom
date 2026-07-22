import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class EstadoReserva(str, enum.Enum):
    PENDIENTE = "PENDIENTE"
    PARCIAL = "PARCIAL"
    PAGADO = "PAGADO"
    CANCELADO = "CANCELADO"


class DescuentoTipo(str, enum.Enum):
    PORCENTAJE = "PORCENTAJE"
    MONTO = "MONTO"  # expresado en USD


class Reserva(Base):
    __tablename__ = "reservas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True, nullable=False)
    cliente: Mapped[str] = mapped_column(String(255), nullable=False)
    id_departamento: Mapped[int] = mapped_column(ForeignKey("departamentos.id"), nullable=False)
    fecha_ingreso: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_egreso: Mapped[date] = mapped_column(Date, nullable=False)
    monto_usd: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    monto_pesos: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    tipo_cambio: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    descuento_tipo: Mapped[DescuentoTipo | None] = mapped_column(Enum(DescuentoTipo), nullable=True)
    descuento_valor: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    estado: Mapped[EstadoReserva] = mapped_column(
        Enum(EstadoReserva), default=EstadoReserva.PENDIENTE, nullable=False
    )
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="reservas")
    departamento: Mapped["Departamento"] = relationship("Departamento", back_populates="reservas")
    pagos: Mapped[list["Pago"]] = relationship("Pago", back_populates="reserva", cascade="all, delete-orphan")
