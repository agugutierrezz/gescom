# Testing de GESCOM

Dos niveles de pruebas: la suite de backend (pytest, 97 tests) que cubre todos los ABM, validaciones e integración entre módulos, y una suite E2E (Playwright) que recorre el flujo completo de creación de reservas en el navegador.

## 1. Suite de backend (pytest)

### Qué cubre

| Archivo | Cobertura |
|---|---|
| `tests/test_auth.py` | Login, tokens, usuario inactivo, rate limit de login (5 intentos/15 min por usuario), reset público eliminado |
| `tests/test_departamentos.py` | ABM completo, nombre único por usuario, baja/alta lógica, filtros, aislamiento multiusuario |
| `tests/test_reservas.py` | ABM, cálculo USD/ARS, solapamiento de fechas, seña (parcial/total/excedida), descuentos, estados, cancelación, PDF |
| `tests/test_pagos.py` | Cuenta corriente: pagos parciales/totales, conversión ARS, excedente con confirmación, cargos, eliminación con recálculo |
| `tests/test_movimientos.py` | ABM de movimientos, filtros históricos, categorías, aislamiento |
| `tests/test_usuarios.py` | Panel admin (RF-18): permisos por rol, alta/renombre/desactivación de operadores |
| `tests/test_disponibilidad.py` | PDF del calendario, validaciones de parámetros |
| `tests/test_finanzas_dashboard.py` | KPIs, transacciones, ocupación, cierre, reportes PDF/Excel, dashboard |
| `tests/test_integracion_flujo.py` | Flujo completo por API: admin crea operador → login → depto → reserva con seña → pagos → dashboard → cancelación |

### Cómo correrla (Windows)

Requiere tu Postgres local corriendo. La suite usa una base separada `gescom_test`
(la crea `create_all`; **nunca toca tu base real** — `conftest.py` pisa `DATABASE_URL` antes de importar la app). Crear la base una única vez:

```
psql -U postgres -c "CREATE DATABASE gescom_test"
```

Luego, en PowerShell (con el venv activado):

```powershell
cd backend
pip install -r requirements.txt   # incluye pytest
$env:TEST_DATABASE_URL = "postgresql://postgres:TU_PASSWORD@localhost:5432/gescom_test"
python -m pytest tests/ -v
```

(En CMD clásico la variable se setea con `set TEST_DATABASE_URL=...` sin comillas.)

Si tu usuario/contraseña de Postgres son otros, ajustá `TEST_DATABASE_URL`.
Resultado esperado: **97 passed**.

Notas:
- dolarapi.com está mockeado (venta = 1000): los tests no usan internet.
- Cada test corre con la base limpia (TRUNCATE automático), se pueden correr en cualquier orden.

## 2. Suite E2E (Playwright)

### Qué recorre

`frontend/e2e/reservas.spec.js`, en un navegador real:

1. Login con credenciales inválidas → mensaje de error.
2. Login correcto → entra al panel.
3. Validaciones del formulario de reserva: fechas invertidas, monto vacío, seña mayor al total.
4. Creación de reserva (USD 500, seña ARS 100.000) → toast de éxito, aparece en el listado con estado **Parcial**.
5. Reserva solapada en el mismo departamento → rechazada con el detalle del backend.
6. La reserva aparece en el calendario de disponibilidad.

### Infraestructura

Playwright levanta todo solo (`playwright.config.js`):
- **Backend e2e** en el puerto 8001 vía `backend/scripts/run_e2e_server.py`: usa una base separada `gescom_e2e` (la crea si no existe a partir de tu `DATABASE_URL` de `backend/.env`) y siembra el usuario `e2e` / `e2e12345` con un departamento. Nunca toca tu base real.
- **Frontend** (Vite) en el puerto 5173 apuntando al backend e2e.
- El endpoint `/tipo-cambio` está mockeado en el navegador (venta = 1000): sin dependencia de dolarapi.

### Cómo correrla (Windows)

Primera vez (instala el navegador de prueba):

```
cd frontend
npm install
npx playwright install chromium
```

Correr los tests (con tu Postgres local corriendo y sin el dev server ocupando el puerto 5173):

```
npm run test:e2e
```

Ver el reporte HTML con screenshots de los fallos:

```
npm run test:e2e:report
```

Para verla en acción con el navegador visible: `npx playwright test --headed`.

### Si el backend E2E no arranca

Un `UnicodeDecodeError` de psycopg2 al iniciar es Postgres en Windows respondiendo un error en español que psycopg2 no puede decodificar; la causa real suele ser de credenciales o base inexistente. Solución:

```powershell
psql -U postgres -c "CREATE DATABASE gescom_e2e"
```

Y si las credenciales de `backend/.env` no sirven para conectarse, definí la URL completa antes de correr:

```powershell
$env:E2E_DATABASE_URL = "postgresql://postgres:TU_PASSWORD@localhost:5432/gescom_e2e"
npm run test:e2e
```

## Resultado de la última corrida

- Backend: **97/97 passed** (6.3s) — sin bugs detectados en ningún módulo.
- E2E: infraestructura verificada (backend e2e + seed + frontend); la corrida con navegador se hace en tu máquina con los comandos de arriba.
