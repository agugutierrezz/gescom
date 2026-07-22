import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TipoMovimiento(str, enum.Enum):
    INGRESO = "INGRESO"
    EGRESO = "EGRESO"


class Movimiento(Base):
    __tablename__ = "movimientos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    id_usuario: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True, nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[TipoMovimiento] = mapped_column(Enum(TipoMovimiento), nullable=False)
    categoria: Mapped[str | None] = mapped_column(String(100), nullable=True)
    id_departamento: Mapped[int | None] = mapped_column(ForeignKey("departamentos.id"), nullable=True)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False)  # ARS o USD
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="movimientos")
    departamento: Mapped["Departamento | None"] = relationship("Departamento", back_populates="movimientos")
