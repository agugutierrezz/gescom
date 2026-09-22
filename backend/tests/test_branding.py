"""Branding del comprobante configurado por la variable BRANDING_COMPLEJOS."""

import base64
import json
from io import BytesIO

import pytest

from app.core.config import settings
from app.services import branding
from tests.conftest import crear_departamento, crear_reserva

# PNG 1x1 válido
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture()
def config_branding(monkeypatch):
    def aplicar(valor):
        monkeypatch.setattr(settings, "BRANDING_COMPLEJOS", valor if isinstance(valor, str) else json.dumps(valor))

    return aplicar


def test_sin_variable_no_hay_branding(config_branding):
    config_branding("")
    assert branding.branding_de("puntapiedras") is None


def test_json_invalido_no_rompe(config_branding):
    config_branding("{esto no es json")
    assert branding.branding_de("puntapiedras") is None


def test_branding_completo_y_campos_faltantes(config_branding):
    config_branding({"complejo1": {"nombre": "Complejo Uno", "direccion": "Calle 1"}})
    marca = branding.branding_de("complejo1")
    assert marca["nombre"] == "Complejo Uno"
    assert marca["direccion"] == "Calle 1"
    assert marca["ciudad"] == "" and marca["cp"] == ""
    assert marca["logo"] == branding.GESCOM_LOGO  # sin logo configurado
    assert branding.branding_de("otro_usuario") is None


def test_logo_base64(config_branding):
    config_branding({"complejo1": {"nombre": "X", "logo_base64": base64.b64encode(PNG_1X1).decode()}})
    logo = branding.branding_de("complejo1")["logo"]
    assert isinstance(logo, BytesIO) and logo.getvalue() == PNG_1X1


def test_pdf_con_branding_del_usuario(client, op_headers, config_branding):
    # op_headers corresponde al usuario "operador1"
    config_branding(
        {"operador1": {"nombre": "Complejo Test", "direccion": "Calle 123", "ciudad": "Ciudad", "cp": "B1234",
                       "logo_base64": base64.b64encode(PNG_1X1).decode()}}
    )
    d = crear_departamento(client, op_headers)
    r = crear_reserva(client, op_headers, d["id"])
    resp = client.get(f"/reservas/{r['id']}/pdf", headers=op_headers)
    assert resp.status_code == 200 and resp.content[:4] == b"%PDF"
