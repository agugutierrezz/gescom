import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class RolUsuario(str, enum.Enum):
    ADMIN = "ADMIN"
    OPERADOR = "OPERADOR"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Nombre de usuario del complejo (ej: "puntapiedras"). Actúa como username.
    nombre: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[RolUsuario] = mapped_column(Enum(RolUsuario), default=RolUsuario.OPERADOR, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Última vez que se cambió la contraseña (UTC). Usado para el límite de 24h.
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    departamentos: Mapped[list["Departamento"]] = relationship("Departamento", back_populates="usuario")
    reservas: Mapped[list["Reserva"]] = relationship("Reserva", back_populates="usuario")
    movimientos: Mapped[list["Movimiento"]] = relationship("Movimiento", back_populates="usuario")
