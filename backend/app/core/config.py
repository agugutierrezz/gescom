from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Orígenes permitidos para CORS, separados por coma.
    # En producción: la URL del frontend (ej. "https://gescom.vercel.app").
    CORS_ORIGINS: str = "http://localhost:5173"

    # Swagger/ReDoc (/docs, /redoc). Poner en False en producción.
    DOCS_ENABLED: bool = True

    # Rate limit de login: máx. intentos fallidos por usuario dentro de la ventana.
    LOGIN_MAX_INTENTOS: int = 5
    LOGIN_VENTANA_MINUTOS: int = 15

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
