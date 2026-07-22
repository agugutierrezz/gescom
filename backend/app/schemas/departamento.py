from pydantic import BaseModel, ConfigDict, Field


class DepartamentoBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    descripcion: str | None = Field(default=None, max_length=1000)
    capacidad_maxima: int = Field(ge=1, le=50)


class DepartamentoCreate(DepartamentoBase):
    pass


class DepartamentoUpdate(DepartamentoBase):
    pass


class DepartamentoEstado(BaseModel):
    activo: bool


class DepartamentoOut(DepartamentoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    activo: bool
