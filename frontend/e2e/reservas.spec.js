// E2E del flujo completo de creación de reservas (GESCOM).
// Recorre: login → formulario con validaciones → creación con seña →
// listado → solapamiento rechazado → calendario de disponibilidad.

import { test, expect } from '@playwright/test';

const USUARIO = 'e2e';
const PASSWORD = 'e2e12345';
const CLIENTE = 'Cliente E2E';

// Cotización mockeada para que el test no dependa de dolarapi.com
const COTIZACION = {
  casa: 'oficial',
  nombre: 'Oficial',
  compra: 990.0,
  venta: 1000.0,
  fecha_actualizacion: new Date().toISOString(),
};

// Fechas de la reserva: dentro de un solo mes calendario para poder
// verificarla en el calendario de disponibilidad sin ambigüedad.
function fechasReserva() {
  const hoy = new Date();
  let base;
  let mesSiguiente = false;
  if (hoy.getDate() <= 22) {
    base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 2);
  } else {
    base = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 5); // fin de mes: usamos el próximo
    mesSiguiente = true;
  }
  const iso = (d) => d.toISOString().slice(0, 10);
  const egreso = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 4);
  return { ingreso: iso(base), egreso: iso(egreso), mesSiguiente };
}

const FECHAS = fechasReserva();

async function mockTipoCambio(page) {
  await page.route('**/tipo-cambio', (route) =>
    route.fulfill({ json: COTIZACION })
  );
}

async function login(page) {
  await mockTipoCambio(page);
  await page.goto('/login');
  await page.fill('#nombre', USUARIO);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'));
}

async function irANuevaReserva(page) {
  await page.goto('/reservas/nueva');
  await expect(page.locator('#cliente')).toBeVisible();
}

async function completarFormulario(page, { monto = '500', sena = null } = {}) {
  await page.fill('#cliente', CLIENTE);
  await page.selectOption('#departamento', { label: 'Depto E2E' });
  await page.fill('#fecha_ingreso', FECHAS.ingreso);
  await page.fill('#fecha_egreso', FECHAS.egreso);
  await page.fill('#monto', monto); // moneda por defecto: USD
  if (sena !== null) {
    await page.fill('#sena', sena);
    // sena_moneda por defecto: ARS
  }
}

test.describe.serial('Flujo de creación de reservas', () => {
  test('login con credenciales inválidas muestra error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#nombre', USUARIO);
    await page.fill('#password', 'incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText(/usuario o contraseña incorrectos/i)).toBeVisible();
  });

  test('login correcto entra al panel', async ({ page }) => {
    await login(page);
    await expect(page).not.toHaveURL(/login/);
  });

  test('validación: fechas invertidas', async ({ page }) => {
    // El campo egreso tiene min={fecha_ingreso}: el navegador bloquea el envío
    // con validación nativa HTML (además de la validación JS de la app).
    await login(page);
    await irANuevaReserva(page);
    await page.fill('#cliente', CLIENTE);
    await page.selectOption('#departamento', { label: 'Depto E2E' });
    await page.fill('#fecha_ingreso', FECHAS.egreso); // invertidas
    await page.fill('#fecha_egreso', FECHAS.ingreso);
    await page.fill('#monto', '500');
    await page.getByRole('button', { name: 'Guardar Reserva' }).click();

    // el navegador marca el campo como inválido (egreso < min) y no envía el form
    const invalido = await page
      .locator('#fecha_egreso')
      .evaluate((el) => el.validity.rangeUnderflow);
    expect(invalido).toBe(true);
    await expect(page).toHaveURL(/\/reservas\/nueva/); // sigue en el formulario
  });

  test('validación: monto obligatorio', async ({ page }) => {
    await login(page);
    await irANuevaReserva(page);
    await page.fill('#cliente', CLIENTE);
    await page.selectOption('#departamento', { label: 'Depto E2E' });
    await page.fill('#fecha_ingreso', FECHAS.ingreso);
    await page.fill('#fecha_egreso', FECHAS.egreso);
    await page.getByRole('button', { name: 'Guardar Reserva' }).click();
    await expect(page.getByText('El monto de la reserva debe ser mayor a 0.')).toBeVisible();
  });

  test('validación: la seña no puede superar el total', async ({ page }) => {
    await login(page);
    await irANuevaReserva(page);
    // monto USD 500 → total ARS 500.000; seña ARS 600.000 la supera
    await completarFormulario(page, { monto: '500', sena: '600000' });
    await page.getByRole('button', { name: 'Guardar Reserva' }).click();
    await expect(
      page.getByText(/La seña no puede superar el total de la reserva/)
    ).toBeVisible();
  });

  test('crea la reserva con seña y la muestra en el listado', async ({ page }) => {
    await login(page);
    await irANuevaReserva(page);

    // el formulario muestra la conversión con el tipo de cambio mockeado
    await completarFormulario(page, { monto: '500', sena: '100000' }); // seña ARS = USD 100
    await expect(page.getByText(/500\.000|500000/).first()).toBeVisible(); // preview en pesos

    await page.getByRole('button', { name: 'Guardar Reserva' }).click();

    // redirige al listado con toast de éxito
    await page.waitForURL('**/reservas');
    await expect(page.getByText(`Reserva de ${CLIENTE} creada con éxito.`)).toBeVisible();

    // la fila muestra cliente, departamento y estado Parcial (seña cobrada)
    const fila = page.locator('tr', { hasText: CLIENTE }).first();
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('Depto E2E');
    await expect(fila).toContainText('Parcial');
  });

  test('rechaza una reserva solapada en el mismo departamento', async ({ page }) => {
    await login(page);
    await irANuevaReserva(page);
    await completarFormulario(page, { monto: '300' }); // mismas fechas que la anterior
    await page.fill('#cliente', 'Otro Cliente');
    await page.getByRole('button', { name: 'Guardar Reserva' }).click();
    await expect(page.getByText(/ya tiene una reserva/)).toBeVisible();
  });

  test('el calendario de disponibilidad muestra la reserva', async ({ page }) => {
    await login(page);
    await page.goto('/disponibilidad');
    if (FECHAS.mesSiguiente) {
      await page.getByRole('button', { name: 'Mes siguiente' }).click();
    }
    // la reserva aparece en la tabla de reservas del mes
    // (getByText a secas matchearía el tooltip oculto de la celda del día)
    await expect(page.getByRole('cell', { name: CLIENTE })).toBeVisible();

    // y el día de check-in tiene el tooltip de la reserva en el calendario
    await expect(page.getByText(`Check-in: ${CLIENTE}`)).toBeAttached();
  });
});
