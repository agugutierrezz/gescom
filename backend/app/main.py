from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers.auth import router as auth_router
from app.routers.dashboard import router as dashboard_router
from app.routers.departamentos import router as departamentos_router
from app.routers.disponibilidad import router as disponibilidad_router
from app.routers.finanzas import router as finanzas_router
from app.routers.movimientos import router as movimientos_router
from app.routers.reservas import cotizacion_router, router as reservas_router
from app.routers.usuarios import router as usuarios_router

app = FastAPI(
    title="GESCOM API",
    version="1.0.0",
    # En producción (DOCS_ENABLED=false) no se expone la documentación de la API.
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(departamentos_router)
app.include_router(reservas_router)
app.include_router(cotizacion_router)
app.include_router(disponibilidad_router)
app.include_router(movimientos_router)
app.include_router(finanzas_router)
app.include_router(dashboard_router)
app.include_router(usuarios_router)


@app.get("/health")
def health():
    return {"status": "ok", "app": "GESCOM"}
