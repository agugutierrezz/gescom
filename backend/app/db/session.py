from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.config import settings

# pool_pre_ping: Neon suspende el compute por inactividad y mata las conexiones
# del pool; con esto SQLAlchemy verifica cada conexión antes de usarla y evita
# errores intermitentes de "connection closed". pool_recycle renueva conexiones
# viejas antes de que el servidor las corte.
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
