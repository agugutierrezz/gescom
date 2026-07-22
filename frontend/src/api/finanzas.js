import { api, getToken, ApiError } from './client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function qs(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== '') search.set(clave, valor);
  });
  const str = search.toString();
  return str ? `?${str}` : '';
}

/**
 * GET /finanzas/resumen?fecha_desde&fecha_hasta
 * → { desde, hasta, tipo_cambio, kpis: { ingresos_ars, ingresos_var, egresos_ars, egresos_var,
 *     balance_ars, ocupacion, ocupacion_var, unidades_activas, pendiente_cobro_ars,
 *     pendiente_cobro_usd, ingresos_anio_ars }, serie: [{ mes, anio, ingresos, egresos }] }
 */
export function getFinanzasResumen(desde, hasta) {
  return api.get(`/finanzas/resumen${qs({ fecha_desde: desde, fecha_hasta: hasta })}`);
}

/**
 * GET /finanzas/transacciones — cobros de reservas + movimientos, unificados.
 * → [{ id, origen: 'PAGO_RESERVA'|'MOVIMIENTO', id_movimiento?, id_reserva?, fecha,
 *      descripcion, tipo, categoria, departamento, monto, moneda, monto_ars }]
 */
export function getTransacciones({ desde, hasta, tipo, q, categoria, departamentoId } = {}) {
  return api.get(
    `/finanzas/transacciones${qs({
      fecha_desde: desde,
      fecha_hasta: hasta,
      tipo,
      q,
      categoria,
      departamento_id: departamentoId,
    })}`
  );
}

/** GET /finanzas/ocupacion — reporte de ocupación por unidad. */
export function getOcupacion(desde, hasta) {
  return api.get(`/finanzas/ocupacion${qs({ fecha_desde: desde, fecha_hasta: hasta })}`);
}

/** GET /finanzas/cierre?anio=&mes= — cierre mensual (con mes) o anual (sin mes). */
export function getCierre(anio, mes) {
  return api.get(`/finanzas/cierre${qs({ anio, mes })}`);
}

// --- ABM de movimientos ---

export function crearMovimiento(data) {
  return api.post('/movimientos', data);
}

export function actualizarMovimiento(id, data) {
  return api.put(`/movimientos/${id}`, data);
}

export function eliminarMovimiento(id) {
  return api.delete(`/movimientos/${id}`);
}

export function getCategorias() {
  return api.get('/movimientos/categorias');
}

/** Descarga el reporte financiero del período en PDF o Excel (RF-17). */
export async function descargarReporte(formato, desde, hasta) {
  const res = await fetch(
    `${API_URL}/finanzas/reporte/${formato}${qs({ fecha_desde: desde, fecha_hasta: hasta })}`,
    { headers: { Authorization: `Bearer ${getToken()}` } }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.detail || `Error ${res.status}`, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte_financiero_${desde}_${hasta}.${formato === 'excel' ? 'xlsx' : 'pdf'}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
