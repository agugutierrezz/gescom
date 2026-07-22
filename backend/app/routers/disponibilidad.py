"""RF: Calendario visual de disponibilidad — exportación a PDF."""

import calendar
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.departamento import Departamento
from app.models.reserva import EstadoReserva, Reserva
from app.models.usuario import Usuario
from app.routers.deps import get_current_user
from app.services.pdf_disponibilidad import MESES, generar_pdf_disponibilidad

router = APIRouter(prefix="/disponibilidad", tags=["disponibilidad"])


@router.get("/pdf")
def exportar_pdf_disponibilidad(
    departamento_id: int,
    anio: int = Query(ge=2000, le=2100),
    mes: int = Query(ge=1, le=12),
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Genera el calendario del mes con la codificación de colores y las reservas."""
    departamento = db.get(Departamento, departamento_id)
    if departamento is None or departamento.id_usuario != usuario.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Departamento no encontrado"
        )

    primer_dia = date(anio, mes, 1)
    ultimo_dia = date(anio, mes, calendar.monthrange(anio, mes)[1])

    reservas = (
        db.scalars(
            select(Reserva)
            .where(
                Reserva.id_departamento == departamento.id,
                Reserva.estado != EstadoReserva.CANCELADO,
                Reserva.fecha_ingreso <= ultimo_dia,
                Reserva.fecha_egreso >= primer_dia,
            )
            .order_by(Reserva.fecha_ingreso)
        ).all()
    )

    contenido = generar_pdf_disponibilidad(departamento, anio, mes, reservas)
    nombre = f"disponibilidad_{departamento.nombre}_{MESES[mes - 1]}_{anio}".replace(" ", "_")
    return Response(
        content=contenido,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nombre}.pdf"'},
    )
