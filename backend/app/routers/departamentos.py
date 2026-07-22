from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.departamento import Departamento
from app.models.usuario import Usuario
from app.routers.deps import get_current_user
from app.schemas.departamento import (
    DepartamentoCreate,
    DepartamentoEstado,
    DepartamentoOut,
    DepartamentoUpdate,
)

router = APIRouter(prefix="/departamentos", tags=["departamentos"])


def _get_departamento_propio(db: Session, usuario: Usuario, departamento_id: int) -> Departamento:
    departamento = db.get(Departamento, departamento_id)
    if departamento is None or departamento.id_usuario != usuario.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Departamento no encontrado",
        )
    return departamento


def _validar_nombre_unico(
    db: Session, usuario: Usuario, nombre: str, excluir_id: int | None = None
) -> None:
    query = select(Departamento).where(
        Departamento.id_usuario == usuario.id,
        func.lower(Departamento.nombre) == nombre.strip().lower(),
    )
    if excluir_id is not None:
        query = query.where(Departamento.id != excluir_id)
    if db.scalar(query) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un departamento con ese nombre",
        )


@router.get("", response_model=list[DepartamentoOut])
def listar_departamentos(
    q: str | None = None,
    activo: bool | None = None,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Departamento).where(Departamento.id_usuario == usuario.id)
    if q:
        query = query.where(Departamento.nombre.ilike(f"%{q.strip()}%"))
    if activo is not None:
        query = query.where(Departamento.activo == activo)
    query = query.order_by(Departamento.nombre)
    return db.scalars(query).all()


@router.get("/{departamento_id}", response_model=DepartamentoOut)
def obtener_departamento(
    departamento_id: int,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_departamento_propio(db, usuario, departamento_id)


@router.post("", response_model=DepartamentoOut, status_code=status.HTTP_201_CREATED)
def crear_departamento(
    payload: DepartamentoCreate,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validar_nombre_unico(db, usuario, payload.nombre)

    departamento = Departamento(
        id_usuario=usuario.id,
        nombre=payload.nombre.strip(),
        descripcion=payload.descripcion,
        capacidad_maxima=payload.capacidad_maxima,
        activo=True,
    )
    db.add(departamento)
    db.commit()
    db.refresh(departamento)
    return departamento


@router.put("/{departamento_id}", response_model=DepartamentoOut)
def actualizar_departamento(
    departamento_id: int,
    payload: DepartamentoUpdate,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    departamento = _get_departamento_propio(db, usuario, departamento_id)
    _validar_nombre_unico(db, usuario, payload.nombre, excluir_id=departamento.id)

    departamento.nombre = payload.nombre.strip()
    departamento.descripcion = payload.descripcion
    departamento.capacidad_maxima = payload.capacidad_maxima
    db.commit()
    db.refresh(departamento)
    return departamento


@router.patch("/{departamento_id}/estado", response_model=DepartamentoOut)
def cambiar_estado_departamento(
    departamento_id: int,
    payload: DepartamentoEstado,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Baja/alta lógica: activo=false desactiva, activo=true reactiva."""
    departamento = _get_departamento_propio(db, usuario, departamento_id)
    departamento.activo = payload.activo
    db.commit()
    db.refresh(departamento)
    return departamento
