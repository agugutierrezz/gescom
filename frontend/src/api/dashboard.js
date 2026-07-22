import { api } from './client';

/**
 * GET /dashboard/resumen
 * Respuesta esperada:
 * {
 *   kpis: { reservas_mes, reservas_var, ocupacion, ocupacion_var, ingresos_ars, ingresos_ars_var,
 *           ingresos_usd, ingresos_usd_var, pendiente_cobro, pendiente_var, balance_positivo, balance_detalle },
 *   flujo_caja: [{ mes: "Ene", ingresos: 2000000, egresos: 1000000 }, ...],
 *   proximos_checkins: [{ id, cliente, departamento, check_in, check_out, estado }, ...]
 * }
 */
export function getDashboardResumen() {
  return api.get('/dashboard/resumen');
}

/** Datos de ejemplo mientras el endpoint no existe en el backend. */
export const MOCK_DASHBOARD = {
  kpis: {
    reservas_mes: 48,
    reservas_var: 12,
    ocupacion: 82,
    ocupacion_var: 5,
    ingresos_ars: 4200000,
    ingresos_ars_var: 18,
    ingresos_usd: 3500,
    ingresos_usd_var: 0,
    pendiente_cobro: 850000,
    pendiente_var: -2,
    balance_positivo: true,
    balance_detalle: 'Ingresos superan egresos por 35%',
  },
  flujo_caja: [
    { mes: 'Ene', ingresos: 2000000, egresos: 1000000 },
    { mes: 'Feb', ingresos: 2500000, egresos: 1250000 },
    { mes: 'Mar', ingresos: 3500000, egresos: 1500000 },
    { mes: 'Abr', ingresos: 3000000, egresos: 1750000 },
    { mes: 'May', ingresos: 4000000, egresos: 2000000 },
    { mes: 'Jun', ingresos: 4500000, egresos: 2250000 },
  ],
  proximos_checkins: [
    { id: 1, cliente: 'Martín S.', departamento: 'Mar del Plata 2A', check_in: '12 Oct', check_out: '15 Oct', estado: 'Pendiente' },
    { id: 2, cliente: 'Laura G.', departamento: 'Pinamar 1B', check_in: '14 Oct', check_out: '20 Oct', estado: 'Confirmado' },
    { id: 3, cliente: 'Flia. Rossi', departamento: 'Gesell 4C', check_in: '15 Oct', check_out: '22 Oct', estado: 'Confirmado' },
    { id: 4, cliente: 'Carlos D.', departamento: 'Cariló VIP', check_in: '18 Oct', check_out: '25 Oct', estado: 'Seña impaga' },
    { id: 5, cliente: 'Ana P.', departamento: 'Mar de las P. 1A', check_in: '20 Oct', check_out: '27 Oct', estado: 'Pendiente' },
  ],
};
