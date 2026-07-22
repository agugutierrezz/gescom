from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.usuario import RolUsuario


class LoginRequest(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1)


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    rol: RolUsuario
    activo: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UsuarioOut


class UsuarioCreate(BaseModel):
    """Alta de cuenta desde el panel de administración. Siempre crea un OPERADOR."""

    nombre: str = Field(min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=8)


class UsuarioRename(BaseModel):
    nombre: str = Field(min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")


class UsuarioEstado(BaseModel):
    activo: bool


class UsuarioAdminOut(UsuarioOut):
    """Fila del panel de usuarios, con datos de actividad de la cuenta.

    Los contadores llevan prefijo cant_ para no chocar con las relaciones
    ORM `departamentos`/`reservas` al validar con from_attributes.
    """

    cant_departamentos: int = 0
    cant_reservas: int = 0
    password_changed_at: datetime | None = None
