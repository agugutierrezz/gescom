"""Gestión de cuentas de usuario, exclusiva del administrador (RF-18).

El admin crea, renombra y activa/desactiva cuentas OPERADOR. No se eliminan
cuentas (conservan sus reservas y movimientos) y las contraseñas las resetea
cada usuario desde /recuperar.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import get_db
from app.models.departamento import Departamento
from app.models.reserva import Reserva
from app.models.usuario import RolUsuario, Usuario
from app.routers.deps import require_admin
from app.schemas.usuario import (
    UsuarioAdminOut,
    UsuarioCreate,
    UsuarioEstado,
    UsuarioRename,
)

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


def _get_usuario(db: Session, usuario_id: int) -> Usuario:
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return usuario


def _validar_nombre_libre(db: Session, nombre: str, excluir_id: int | None = None) -> None:
    query = select(Usuario).where(Usuario.nombre == nombre)
    if excluir_id is not None:
        query = query.where(Usuario.id != excluir_id)
    if db.scalar(query) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un usuario con el nombre '{nombre}'",
        )


def _a_out(usuario: Usuario, departamentos: int = 0, reservas: int = 0) -> UsuarioAdminOut:
    out = UsuarioAdminOut.model_validate(usuario)
    out.cant_departamentos = departamentos
    out.cant_reservas = reservas
    return out


@router.get("", response_model=list[UsuarioAdminOut])
def listar_usuarios(
    q: str | None = None,
    activo: bool | None = None,
    _: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = select(Usuario).order_by(Usuario.rol, Usuario.nombre)
    if q:
        query = query.where(Usuario.nombre.ilike(f"%{q.strip()}%"))
    if activo is not None:
        query = query.where(Usuario.activo == activo)
    usuarios = db.scalars(query).all()

    deptos = dict(
        db.execute(
            select(Departamento.id_usuario, func.count(Departamento.id)).group_by(
                Departamento.id_usuario
            )
        ).all()
    )
    reservas = dict(
        db.execute(
            select(Reserva.id_usuario, func.count(Reserva.id)).group_by(Reserva.id_usuario)
        ).all()
    )
    return [_a_out(u, deptos.get(u.id, 0), reservas.get(u.id, 0)) for u in usuarios]


@router.post("", response_model=UsuarioAdminOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    payload: UsuarioCreate,
    _: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Crea una cuenta OPERADOR (hay un único ADMIN en el sistema)."""
    nombre = payload.nombre.strip()
    _validar_nombre_libre(db, nombre)
    usuario = Usuario(
        nombre=nombre,
        hashed_password=hash_password(payload.password),
        rol=RolUsuario.OPERADOR,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return _a_out(usuario)


@router.put("/{usuario_id}", response_model=UsuarioAdminOut)
def renombrar_usuario(
    usuario_id: int,
    payload: UsuarioRename,
    admin: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Cambia el nombre de usuario (el nombre es el username de login)."""
    usuario = _get_usuario(db, usuario_id)
    nombre = payload.nombre.strip()
    _validar_nombre_libre(db, nombre, excluir_id=usuario.id)
    usuario.nombre = nombre
    db.commit()
    db.refresh(usuario)
    return _a_out(usuario)


@router.patch("/{usuario_id}/estado", response_model=UsuarioAdminOut)
def cambiar_estado_usuario(
    usuario_id: int,
    payload: UsuarioEstado,
    admin: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Activa o desactiva una cuenta (baja lógica: el usuario no puede iniciar sesión)."""
    usuario = _get_usuario(db, usuario_id)
    if usuario.id == admin.id and not payload.activo:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No podés desactivar tu propia cuenta de administrador",
        )
    usuario.activo = payload.activo
    db.commit()
    db.refresh(usuario)
    return _a_out(usuario)
