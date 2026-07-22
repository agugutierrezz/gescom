import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardResumen, MOCK_DASHBOARD } from '../api/dashboard';

function formatARS(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

function TrendBadge({ value }) {
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-label-sm text-tertiary bg-tertiary-container/20 px-2 py-1 rounded-full">
        <span className="material-symbols-outlined text-[16px]">trending_up</span>+{value}%
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-label-sm text-error bg-error-container/50 px-2 py-1 rounded-full">
        <span className="material-symbols-outlined text-[16px]">trending_down</span>{value}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-label-sm text-on-surface-variant bg-surface-variant px-2 py-1 rounded-full">
      <span className="material-symbols-outlined text-[16px]">trending_flat</span>0%
    </span>
  );
}

function KpiCard({ icon, label, value, trend, highlighted, detail }) {
  return (
    <div className={`bg-surface rounded-xl p-6 shadow-warm flex flex-col justify-between ${highlighted ? 'border-l-4 border-primary' : ''}`}>
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-secondary-container/30 rounded-lg text-primary">
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        {trend !== undefined && <TrendBadge value={trend} />}
      </div>
      <div>
        <p className="text-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">{label}</p>
        <h3 className={`text-h1 ${highlighted ? 'text-primary' : 'text-on-surface'}`}>{value}</h3>
        {detail && <p className="text-caption text-on-surface-variant mt-1">{detail}</p>}
      </div>
    </div>
  );
}

const ESTADO_STYLES = {
  Confirmado: 'bg-tertiary-container/20 text-tertiary',
  Pendiente: 'bg-secondary-container/50 text-secondary',
  'Seña impaga': 'bg-error-container/50 text-error',
};

function EstadoBadge({ estado }) {
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-label-sm ${ESTADO_STYLES[estado] || 'bg-surface-variant text-on-surface-variant'}`}>
      {estado}
    </span>
  );
}

function CashFlowChart({ data }) {
  const max = Math.max(...data.map((d) => Math.max(d.ingresos, d.egresos)), 1);
  const yMid = formatARS(max / 2);
  const yMax = formatARS(max);

  return (
    <div className="lg:col-span-2 bg-surface rounded-xl p-6 shadow-warm flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-h3 text-on-surface">Flujo de Caja (Últimos 6 meses)</h3>
        <button className="text-on-surface-variant hover:text-primary transition-colors" aria-label="Opciones">
          <span className="material-symbols-outlined">more_horiz</span>
        </button>
      </div>

      <div className="flex-grow flex items-end justify-between gap-2 mt-4 h-48 relative border-b border-outline-variant/30 pb-2 pl-10">
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-caption text-on-surface-variant">
          <span>{yMax}</span>
          <span>{yMid}</span>
          <span>$0</span>
        </div>
        {data.map((d) => (
          <div key={d.mes} className="w-full h-full flex flex-col justify-end items-center gap-1 group">
            <div
              className="w-full max-w-[40px] bg-primary rounded-t-sm group-hover:bg-primary/80 transition-colors relative"
              style={{ height: `${(d.ingresos / max) * 100}%` }}
            >
              <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface text-caption px-2 py-1 rounded whitespace-nowrap pointer-events-none transition-opacity z-10">
                Ing: {formatARS(d.ingresos)}
              </div>
            </div>
            <div
              className="w-full max-w-[40px] bg-secondary-container rounded-t-sm group-hover:bg-secondary-container/80 transition-colors relative"
              style={{ height: `${(d.egresos / max) * 100}%` }}
            >
              <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface text-caption px-2 py-1 rounded whitespace-nowrap pointer-events-none transition-opacity z-10">
                Egr: {formatARS(d.egresos)}
              </div>
            </div>
            <span className="text-caption text-on-surface-variant mt-2">{d.mes}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-6 mt-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-primary rounded-sm" />
          <span className="text-caption text-on-surface-variant">Ingresos</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-secondary-container rounded-sm" />
          <span className="text-caption text-on-surface-variant">Egresos</span>
        </div>
      </div>
    </div>
  );
}

function CheckinsTable({ rows }) {
  return (
    <div className="lg:col-span-1 bg-surface rounded-xl p-6 shadow-warm flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-h3 text-on-surface">Próximos Check-ins</h3>
        <Link className="text-label-sm text-primary hover:underline" to="/reservas">Ver todas</Link>
      </div>
      <div className="flex-grow overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#C8A96E]/10">
              <th className="pb-3 text-label-sm text-on-surface-variant font-semibold">Cliente / Depto</th>
              <th className="pb-3 text-label-sm text-on-surface-variant font-semibold">Fechas</th>
              <th className="pb-3 text-label-sm text-on-surface-variant font-semibold text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-container-low/50 transition-colors">
                <td className="py-3">
                  <p className="text-body-medium text-on-surface">{r.cliente}</p>
                  <p className="text-caption text-on-surface-variant">{r.departamento}</p>
                </td>
                <td className="py-3">
                  <p className="text-body-base text-on-surface">{r.check_in}</p>
                  <p className="text-caption text-on-surface-variant">{r.check_out}</p>
                </td>
                <td className="py-3 text-right">
                  <EstadoBadge estado={r.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDashboardResumen()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        // Endpoint aún no implementado o backend caído → datos de ejemplo
        if (!cancelled) {
          setData(MOCK_DASHBOARD);
          setUsingMock(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-primary text-[32px]">
          progress_activity
        </span>
      </div>
    );
  }

  const { kpis, flujo_caja, proximos_checkins } = data;

  return (
    <>
      {usingMock && (
        <div className="mb-gutter flex items-center gap-2 bg-secondary-container/40 text-on-secondary-container rounded-lg px-4 py-2 text-body-base">
          <span className="material-symbols-outlined text-[20px]">info</span>
          Mostrando datos de ejemplo: la API de dashboard no está disponible.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter mb-gutter">
        <KpiCard icon="calendar_today" label="Reservas este mes" value={kpis.reservas_mes} trend={kpis.reservas_var} />
        <KpiCard icon="bed" label="Ocupación" value={`${kpis.ocupacion}%`} trend={kpis.ocupacion_var} />
        <KpiCard icon="payments" label="Ingresos ARS (Mes)" value={formatARS(kpis.ingresos_ars)} trend={kpis.ingresos_ars_var} />
        <KpiCard icon="attach_money" label="Ingresos USD (Mes)" value={`u$s ${kpis.ingresos_usd.toLocaleString('es-AR')}`} trend={kpis.ingresos_usd_var} />
        <KpiCard icon="pending_actions" label="Pendiente de cobro" value={formatARS(kpis.pendiente_cobro)} trend={kpis.pendiente_var} />
        <KpiCard
          icon="account_balance_wallet"
          label="Balance Mensual"
          value={kpis.balance_positivo ? 'Positivo' : 'Negativo'}
          detail={kpis.balance_detalle}
          highlighted
        />
      </div>

      {/* Gráfico + Tabla */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <CashFlowChart data={flujo_caja} />
        <CheckinsTable rows={proximos_checkins} />
      </div>
    </>
  );
}
