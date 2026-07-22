import { api } from './client';

/**
 * Gestión de cuentas (solo ADMIN).
 * GET /usuarios → [{ id, nombre, rol, activo, created_at, cant_departamentos, cant_reservas, password_changed_at }]
 */
export function getUsuarios({ q, activo } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (activo !== undefined && activo !== null && activo !== '') params.set('activo', activo);
  const qs = params.toString();
  return api.get(`/usuarios${qs ? `?${qs}` : ''}`);
}

/** Crea una cuenta OPERADOR. */
export function crearUsuario(nombre, password) {
  return api.post('/usuarios', { nombre, password });
}

/** Cambia el nombre de usuario (username de login). */
export function renombrarUsuario(id, nombre) {
  return api.put(`/usuarios/${id}`, { nombre });
}

/** Activa o desactiva la cuenta (baja lógica). */
export function cambiarEstadoUsuario(id, activo) {
  return api.patch(`/usuarios/${id}/estado`, { activo });
}
