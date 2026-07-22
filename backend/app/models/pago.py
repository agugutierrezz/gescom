import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Moneda(str, enum.Enum):
    ARS = "ARS"
    USD = "USD"


class TipoPago(str, enum.Enum):
    CARGO = "CARGO"  # algo que el cliente consume/debe (sube el saldo): desayuno, limpieza…
    PAGO = "PAGO"    # plata que el cliente entrega (baja el saldo): seña, cuotas…


class Pago(Base):
    __tablename__ = "pagos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    id_reserva: Mapped[int] = mapped_column(ForeignKey("reservas.id"), nullable=False)
    tipo: Mapped[TipoPago] = mapped_column(Enum(TipoPago), default=TipoPago.PAGO, nullable=False)
    concepto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha_pago: Mapped[date] = mapped_column(Date, nullable=False)
    monto_original: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    moneda: Mapped[Moneda] = mapped_column(Enum(Moneda), nullable=False)
    medio_pago: Mapped[str | None] = mapped_column(String(50), nullable=True)  # solo para tipo=PAGO
    monto_final: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    reserva: Mapped["Reserva"] = relationship("Reserva", back_populates="pagos")
