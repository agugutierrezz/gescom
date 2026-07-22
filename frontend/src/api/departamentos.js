import { api } from './client';

/**
 * GET /departamentos?q=&activo=
 * Respuesta: [{ id, nombre, descripcion, capacidad_maxima, activo }, ...]
 */
export function getDepartamentos({ q, activo } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (activo !== undefined && activo !== null) params.set('activo', activo);
  const qs = params.toString();
  return api.get(`/departamentos${qs ? `?${qs}` : ''}`);
}

export function crearDepartamento(data) {
  return api.post('/departamentos', data);
}

export function actualizarDepartamento(id, data) {
  return api.put(`/departamentos/${id}`, data);
}

export function cambiarEstadoDepartamento(id, activo) {
  return api.patch(`/departamentos/${id}/estado`, { activo });
}
