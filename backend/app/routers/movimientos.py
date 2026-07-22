"""ABM de movimientos operativos (RF-15) y consulta histórica (RF-16)."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models.departamento import Departamento
from app.models.movimiento import Movimiento, TipoMovimiento
from app.models.usuario import Usuario
from app.routers.deps import get_current_user
from app.schemas.movimiento import MovimientoCreate, MovimientoOut, MovimientoUpdate

router = APIRouter(prefix="/movimientos", tags=["movimientos"])


def _get_movimiento_propio(db: Session, usuario: Usuario, movimiento_id: int) -> Movimiento:
    movimiento = db.get(Movimiento, movimiento_id, options=[joinedload(Movimiento.departamento)])
    if movimiento is None or movimiento.id_usuario != usuario.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movimiento no encontrado")
    return movimiento


def _validar_departamento(db: Session, usuario: Usuario, departamento_id: int | None) -> None:
    if departamento_id is None:
        return
    departamento = db.get(Departamento, departamento_id)
    if departamento is None or departamento.id_usuario != usuario.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Departamento no encontrado"
        )


def _a_out(movimiento: Movimiento) -> MovimientoOut:
    out = MovimientoOut.model_validate(movimiento)
    out.departamento_nombre = movimiento.departamento.nombre if movimiento.departamento else None
    return out


@router.get("", response_model=list[MovimientoOut])
def listar_movimientos(
    q: str | None = None,
    tipo: TipoMovimiento | None = None,
    categoria: str | None = None,
    departamento_id: int | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Consulta histórica de movimientos filtrando por período, tipo y categoría (RF-16)."""
    query = (
        select(Movimiento)
        .options(joinedload(Movimiento.departamento))
        .where(Movimiento.id_usuario == usuario.id)
    )
    if q:
        query = query.where(Movimiento.descripcion.ilike(f"%{q.strip()}%"))
    if tipo is not None:
        query = query.where(Movimiento.tipo == tipo)
    if categoria:
        query = query.where(Movimiento.categoria.ilike(categoria.strip()))
    if departamento_id is not None:
        query = query.where(Movimiento.id_departamento == departamento_id)
    if fecha_desde is not None:
        query = query.where(Movimiento.fecha >= fecha_desde)
    if fecha_hasta is not None:
        query = query.where(Movimiento.fecha <= fecha_hasta)
    query = query.order_by(Movimiento.fecha.desc(), Movimiento.id.desc())
    return [_a_out(m) for m in db.scalars(query).all()]


@router.get("/categorias", response_model=list[str])
def listar_categorias(
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Categorías ya usadas por el usuario (para autocompletar y filtrar)."""
    filas = db.scalars(
        select(Movimiento.categoria)
        .where(Movimiento.id_usuario == usuario.id, Movimiento.categoria.is_not(None))
        .distinct()
        .order_by(Movimiento.categoria)
    ).all()
    return [c for c in filas if c]


@router.post("", response_model=MovimientoOut, status_code=status.HTTP_201_CREATED)
def crear_movimiento(
    payload: MovimientoCreate,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validar_departamento(db, usuario, payload.id_departamento)
    movimiento = Movimiento(
        id_usuario=usuario.id,
        fecha=payload.fecha,
        descripcion=payload.descripcion.strip(),
        tipo=payload.tipo,
        categoria=payload.categoria.strip() if payload.categoria else None,
        id_departamento=payload.id_departamento,
        monto=payload.monto,
        moneda=payload.moneda.value,
    )
    db.add(movimiento)
    db.commit()
    db.refresh(movimiento)
    return _a_out(movimiento)


@router.put("/{movimiento_id}", response_model=MovimientoOut)
def actualizar_movimiento(
    movimiento_id: int,
    payload: MovimientoUpdate,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    movimiento = _get_movimiento_propio(db, usuario, movimiento_id)
    _validar_departamento(db, usuario, payload.id_departamento)
    movimiento.fecha = payload.fecha
    movimiento.descripcion = payload.descripcion.strip()
    movimiento.tipo = payload.tipo
    movimiento.categoria = payload.categoria.strip() if payload.categoria else None
    movimiento.id_departamento = payload.id_departamento
    movimiento.monto = payload.monto
    movimiento.moneda = payload.moneda.value
    db.commit()
    db.refresh(movimiento)
    return _a_out(movimiento)


@router.delete("/{movimiento_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_movimiento(
    movimiento_id: int,
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    movimiento = _get_movimiento_propio(db, usuario, movimiento_id)
    db.delete(movimiento)
    db.commit()
