import { api } from './client';

/**
 * POST /auth/login
 * Espera del backend: { access_token: string, token_type: "bearer", user: { id, nombre, rol } }
 */
export function loginRequest(nombre, password) {
  return api.post('/auth/login', { nombre, password }, { auth: false });
}

/**
 * GET /auth/me — usuario actual a partir del token.
 */
export function meRequest() {
  return api.get('/auth/me');
}
