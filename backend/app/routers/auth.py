from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.usuario import Usuario
from app.routers.deps import get_current_user
from app.schemas.usuario import LoginRequest, TokenResponse, UsuarioOut

router = APIRouter(prefix="/auth", tags=["auth"])

# --- Rate limit de login (en memoria, por nombre de usuario) -----------------
# Registra los intentos fallidos recientes. Suficiente para un proceso único;
# protege contra fuerza bruta sobre una cuenta. Se limpia al loguear bien.
_intentos_fallidos: dict[str, list[datetime]] = defaultdict(list)


def _utcnow_naive() -> datetime:
    """Hora UTC sin tzinfo, consistente con las columnas DateTime sin timezone."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def limpiar_intentos_login() -> None:
    """Resetea el estado del rate limit (usado por los tests)."""
    _intentos_fallidos.clear()


def _verificar_rate_limit(nombre: str) -> None:
    ventana = timedelta(minutes=settings.LOGIN_VENTANA_MINUTOS)
    ahora = _utcnow_naive()
    recientes = [t for t in _intentos_fallidos[nombre] if ahora - t < ventana]
    _intentos_fallidos[nombre] = recientes
    if len(recientes) >= settings.LOGIN_MAX_INTENTOS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Demasiados intentos fallidos. "
                f"Esperá {settings.LOGIN_VENTANA_MINUTOS} minutos y volvé a intentar."
            ),
        )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    _verificar_rate_limit(payload.nombre)

    usuario = db.scalar(select(Usuario).where(Usuario.nombre == payload.nombre))

    if usuario is None or not verify_password(payload.password, usuario.hashed_password):
        _intentos_fallidos[payload.nombre].append(_utcnow_naive())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario está inactivo",
        )

    _intentos_fallidos.pop(payload.nombre, None)
    token = create_access_token(str(usuario.id))
    return TokenResponse(access_token=token, user=UsuarioOut.model_validate(usuario))


@router.get("/me", response_model=UsuarioOut)
def me(usuario: Usuario = Depends(get_current_user)):
    return usuario


# NOTA: el endpoint público POST /auth/reset-password fue eliminado por seguridad:
# permitía cambiar la contraseña de un OPERADOR conociendo solo su nombre.
# Recuperación de contraseñas:
#   - OPERADOR: el ADMIN la resetea desde el panel de usuarios (RF-18).
#   - ADMIN: por consola en el servidor (python -m scripts.cambiar_password).
