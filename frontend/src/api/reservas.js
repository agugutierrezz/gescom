import { api, getToken, ApiError } from './client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * GET /reservas?q=&departamento_id=&estado=&fecha_desde=&fecha_hasta=
 * Respuesta: [{ id, cliente, id_departamento, departamento_nombre, fecha_ingreso,
 *              fecha_egreso, monto_usd, monto_pesos, tipo_cambio, estado, observaciones }, ...]
 */
export function getReservas({ q, departamentoId, estado, fechaDesde, fechaHasta } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (departamentoId) params.set('departamento_id', departamentoId);
  if (estado) params.set('estado', estado);
  if (fechaDesde) params.set('fecha_desde', fechaDesde);
  if (fechaHasta) params.set('fecha_hasta', fechaHasta);
  const qs = params.toString();
  return api.get(`/reservas${qs ? `?${qs}` : ''}`);
}

export function getReserva(id) {
  return api.get(`/reservas/${id}`);
}

export function crearReserva(data) {
  return api.post('/reservas', data);
}

export function actualizarReserva(id, data) {
  return api.put(`/reservas/${id}`, data);
}

/**
 * PATCH /reservas/{id}/cancelar
 * devolucion (opcional): { devolucion_monto, devolucion_moneda } — registra
 * un movimiento EGRESO "Devolución" con fecha de hoy y el depto de la reserva.
 */
export function cancelarReserva(id, devolucion) {
  return api.patch(`/reservas/${id}/cancelar`, devolucion ?? undefined);
}

/** GET /reservas/{id}/pagos → historial de movimientos de la reserva */
export function getPagos(reservaId) {
  return api.get(`/reservas/${reservaId}/pagos`);
}

/**
 * POST /reservas/{id}/pagos — CU02: registrar pago.
 * data: { fecha_pago, monto, moneda, medio_pago?, concepto?, permitir_excedente? }
 * Devuelve la reserva actualizada (estado y saldo nuevos).
 */
export function registrarPago(reservaId, data) {
  return api.post(`/reservas/${reservaId}/pagos`, data);
}

/** DELETE /reservas/{id}/pagos/{pagoId} → reserva actualizada */
export function eliminarPago(reservaId, pagoId) {
  return api.delete(`/reservas/${reservaId}/pagos/${pagoId}`);
}

/** GET /tipo-cambio → { casa, nombre, compra, venta, fecha_actualizacion } */
export function getTipoCambio() {
  return api.get('/tipo-cambio');
}

/** Descarga el comprobante PDF de la reserva y dispara el guardado en el navegador. */
export async function descargarPdfReserva(id) {
  const res = await fetch(`${API_URL}/reservas/${id}/pdf`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.detail || `Error ${res.status}`, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reserva_${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
