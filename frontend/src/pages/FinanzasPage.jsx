import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDepartamentos } from '../api/departamentos';
import {
  actualizarMovimiento,
  crearMovimiento,
  descargarReporte,
  eliminarMovimiento,
  getCategorias,
  getCierre,
  getFinanzasResumen,
  getOcupacion,
  getTransacciones,
} from '../api/finanzas';
import { useFeedback } from '../context/FeedbackContext';

const FILAS_POR_PAGINA = 10;

const CATEGORIAS_SUGERIDAS = [
  'Limpieza',
  'Mantenimiento',
  'Servicios',
  'Impuestos',
  'Insumos',
  'Devolución',
  'Otros',
];

function iso(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function rangoPreset(preset) {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  switch (preset) {
    case 'mes_anterior': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      return { desde: iso(inicio), hasta: iso(fin) };
    }
    case 'tres_meses': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
      return { desde: iso(inicio), hasta: iso(finMes) };
    }
    case 'anio':
      return { desde: iso(new Date(hoy.getFullYear(), 0, 1)), hasta: iso(finMes) };
    default:
      return { desde: iso(inicioMes), hasta: iso(finMes) };
  }
}

function formatARS(valor) {
  return `$ ${Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatFecha(isoFecha) {
  const [y, m, d] = isoFecha.split('-');
  return `${d}/${m}/${y}`;
}

function TrendBadge({ value, invertido = false }) {
  const positivo = invertido ? value < 0 : value > 0;
  const icono = value > 0 ? 'arrow_upward' : value < 0 ? 'arrow_downward' : 'trending_flat';
  const color = value === 0 ? 'text-on-surface-variant' : positivo ? 'text-tertiary' : 'text-error';
  return (
    <span className={`inline-flex items-center gap-1 text-caption font-medium ${color}`}>
      <span className="material-symbols-outlined text-[14px]">{icono}</span>
      {value > 0 ? '+' : ''}
      {value}% vs período anterior
    </span>
  );
}

function KpiCard({ icon, iconBg, iconColor, label, value, trend, invertido, detail, valueClass = 'text-on-surface' }) {
  return (
    <div className="bg-surface rounded-xl p-6 shadow-warm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <span className="text-body-medium text-on-surface-variant">{label}</span>
        <div className={`w-8 h-8 rounded-full ${iconBg} flex items-center justify-center`}>
          <span className={`material-symbols-outlined text-[20px] ${iconColor}`}>{icon}</span>
        </div>
      </div>
      <div>
        <h2 className={`text-h1 ${valueClass}`}>{value}</h2>
        <div className="mt-2 min-h-[18px]">
          {trend !== undefined && <TrendBadge value={trend} invertido={invertido} />}
          {detail && <p className="text-caption text-on-surface-variant">{detail}</p>}
        </div>
      </div>
    </div>
  );
}

function GraficoIngresoEgreso({ serie }) {
  const max = Math.max(...serie.map((p) => Math.max(p.ingresos, p.egresos)), 1);
  const puntos = (clave) =>
    serie
      .map((p, i) => {
        const x = serie.length > 1 ? (i / (serie.length - 1)) * 100 : 50;
        const y = 95 - (p[clave] / max) * 88;
        return `${x},${y}`;
      })
      .join(' ');

  const abreviar = (v) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace('.0', '')}M`;
    if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
    return `$${Math.round(v)}`;
  };

  return (
    <div className="bg-surface rounded-xl p-6 shadow-warm">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-h3 text-on-surface">Ingresos vs Egresos (Últimos 6 meses)</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-caption text-on-surface-variant">Ingresos</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-secondary" />
            <span className="text-caption text-on-surface-variant">Egresos</span>
          </div>
        </div>
      </div>
      <div className="relative pl-12 pr-2 pt-4">
        <div className="absolute left-0 top-4 h-56 flex flex-col justify-between text-caption text-on-surface-variant">
          <span>{abreviar(max)}</span>
          <span>{abreviar(max / 2)}</span>
          <span>$0</span>
        </div>
        <div className="h-56 border-b border-l border-outline-variant/40 relative">
          <div className="absolute left-0 top-0 w-full border-t border-dashed border-outline-variant/30" />
          <div className="absolute left-0 top-1/2 w-full border-t border-dashed border-outline-variant/30" />
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <polyline
              fill="none"
              points={puntos('ingresos')}
              stroke="#00526d"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              fill="none"
              points={puntos('egresos')}
              stroke="#735b28"
              strokeDasharray="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="flex justify-between mt-2 text-caption text-on-surface-variant">
          {serie.map((p) => (
            <span key={`${p.anio}-${p.mes}`}>{p.mes}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MovimientoModal({ movimiento, categorias, departamentos, onClose, onGuardado }) {
  const { toast } = useFeedback();
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(() => ({
    fecha: movimiento?.fecha || iso(new Date()),
    tipo: movimiento?.tipo || 'EGRESO',
    descripcion: movimiento?.descripcion || '',
    categoria: movimiento?.categoria || '',
    id_departamento: movimiento?.id_departamento ?? '',
    monto: movimiento?.monto ?? '',
    moneda: movimiento?.moneda || 'ARS',
  }));

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      const payload = {
        fecha: form.fecha,
        tipo: form.tipo,
        descripcion: form.descripcion.trim(),
        categoria: form.categoria.trim() || null,
        id_departamento: form.id_departamento === '' ? null : Number(form.id_departamento),
        monto: Number(form.monto),
        moneda: form.moneda,
      };
      if (movimiento?.id_movimiento) {
        await actualizarMovimiento(movimiento.id_movimiento, payload);
        toast('Movimiento actualizado con éxito.');
      } else {
        await crearMovimiento(payload);
        toast('Movimiento registrado con éxito.');
      }
      onGuardado();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  // Lista fija + la categoría actual del movimiento si es un valor viejo fuera de la lista
  const listaCategorias = [
    ...new Set([...CATEGORIAS_SUGERIDAS, ...(movimiento?.categoria ? [movimiento.categoria] : [])]),
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface-container-lowest rounded-xl shadow-warm w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-h3 text-on-surface">
            {movimiento ? 'Editar movimiento' : 'Nuevo movimiento'}
          </h3>
          <button type="button" onClick={onClose} className="text-outline hover:text-on-surface" aria-label="Cerrar">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={guardar} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-label-sm text-on-surface-variant">Tipo</span>
              <select
                value={form.tipo}
                onChange={set('tipo')}
                className="h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none"
              >
                <option value="INGRESO">Ingreso</option>
                <option value="EGRESO">Egreso</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label-sm text-on-surface-variant">Fecha</span>
              <input
                type="date"
                required
                value={form.fecha}
                onChange={set('fecha')}
                className="h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-label-sm text-on-surface-variant">Descripción</span>
            <input
              type="text"
              required
              maxLength={2000}
              placeholder="Ej: Factura de luz - Septiembre"
              value={form.descripcion}
              onChange={set('descripcion')}
              className="h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-label-sm text-on-surface-variant">Categoría</span>
              <select
                value={form.categoria}
                onChange={set('categoria')}
                className="h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none"
              >
                <option value="">Sin categoría</option>
                {listaCategorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label-sm text-on-surface-variant">Departamento</span>
              <select
                value={form.id_departamento}
                onChange={set('id_departamento')}
                className="h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none"
              >
                <option value="">Global (todo el complejo)</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-label-sm text-on-surface-variant">Monto</span>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.monto}
                onChange={set('monto')}
                className="h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label-sm text-on-surface-variant">Moneda</span>
              <select
                value={form.moneda}
                onChange={set('moneda')}
                className="h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none"
              >
                <option value="ARS">ARS (pesos)</option>
                <option value="USD">USD (dólares)</option>
              </select>
            </label>
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-[40px] px-4 rounded-lg border border-outline-variant text-on-surface text-body-semibold hover:bg-surface-variant/40 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="h-[40px] px-5 rounded-lg bg-primary text-on-primary text-body-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TablaTransacciones({ filas, cargando, onEditar, onEliminar }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtroTipo && f.tipo !== filtroTipo) return false;
      if (q && !`${f.descripcion} ${f.categoria || ''} ${f.departamento || ''}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [filas, busqueda, filtroTipo]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / FILAS_POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filtradas.slice((paginaActual - 1) * FILAS_POR_PAGINA, paginaActual * FILAS_POR_PAGINA);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, filtroTipo, filas]);

  return (
    <div className="bg-surface rounded-xl shadow-warm overflow-hidden">
      <div className="p-6 border-b border-outline-variant/20 flex flex-col md:flex-row justify-between md:items-center gap-3">
        <h3 className="text-h3 text-on-surface">Movimientos del período</h3>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="h-9 px-3 rounded-lg border border-outline-variant/60 bg-surface-bright text-body-base outline-none focus:border-primary"
          >
            <option value="">Todos</option>
            <option value="INGRESO">Ingresos</option>
            <option value="EGRESO">Egresos</option>
          </select>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Buscar transacción..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-9 pl-9 pr-4 rounded-lg border border-outline-variant/60 bg-surface-bright focus:border-primary text-body-base outline-none w-56"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/20 bg-surface-bright/50">
              {['Fecha', 'Descripción', 'Tipo', 'Categoría', 'Depto'].map((h) => (
                <th key={h} className="py-3 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider">
                  {h}
                </th>
              ))}
              <th className="py-3 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider text-right">
                Monto (ARS)
              </th>
              <th className="py-3 px-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {cargando && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-on-surface-variant">
                  Cargando movimientos…
                </td>
              </tr>
            )}
            {!cargando && visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-on-surface-variant">
                  No hay movimientos para los filtros seleccionados.
                </td>
              </tr>
            )}
            {!cargando &&
              visibles.map((f) => {
                const esIngreso = f.tipo === 'INGRESO';
                return (
                  <tr key={f.id} className="hover:bg-surface-container-low/50 transition-colors group">
                    <td className="py-3 px-6 text-body-base text-on-surface whitespace-nowrap">
                      {formatFecha(f.fecha)}
                    </td>
                    <td className="py-3 px-6 text-body-medium text-on-surface">
                      {f.descripcion}
                      {f.moneda === 'USD' && (
                        <span className="ml-2 text-caption text-on-surface-variant">
                          (u$s {Number(f.monto).toLocaleString('es-AR')})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-6">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold ${
                          esIngreso ? 'bg-tertiary-container/20 text-tertiary' : 'bg-error-container/50 text-error'
                        }`}
                      >
                        {esIngreso ? 'Ingreso' : 'Egreso'}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-body-base text-on-surface-variant">{f.categoria || '-'}</td>
                    <td className="py-3 px-6 text-body-base text-on-surface-variant">{f.departamento || 'Global'}</td>
                    <td
                      className={`py-3 px-6 text-body-semibold text-right whitespace-nowrap ${
                        esIngreso ? 'text-on-surface' : 'text-error'
                      }`}
                    >
                      {esIngreso ? '' : '- '}
                      {formatARS(f.monto_ars)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {f.origen === 'MOVIMIENTO' ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onEditar(f)}
                            className="p-1 text-outline hover:text-primary transition-colors"
                            aria-label="Editar movimiento"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onEliminar(f)}
                            className="p-1 text-outline hover:text-error transition-colors"
                            aria-label="Eliminar movimiento"
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        </div>
                      ) : (
                        <span
                          className="material-symbols-outlined text-[18px] text-outline/60"
                          title="Cobro de reserva: se gestiona desde Reservas"
                        >
                          lock
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-outline-variant/20 flex justify-between items-center">
        <span className="text-caption text-on-surface-variant">
          Mostrando {visibles.length} de {filtradas.length} movimientos
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={paginaActual <= 1}
            onClick={() => setPagina((p) => p - 1)}
            className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:bg-secondary-container/30 transition-colors disabled:opacity-40"
            aria-label="Página anterior"
          >
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          <span className="text-caption text-on-surface-variant px-2">
            {paginaActual} / {totalPaginas}
          </span>
          <button
            type="button"
            disabled={paginaActual >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:bg-secondary-container/30 transition-colors disabled:opacity-40"
            aria-label="Página siguiente"
          >
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function TablaOcupacion({ ocupacion }) {
  if (!ocupacion) return null;
  return (
    <div className="bg-surface rounded-xl shadow-warm overflow-hidden">
      <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
        <h3 className="text-h3 text-on-surface">Ocupación por unidad</h3>
        <span className="text-caption text-on-surface-variant">
          Promedio: <strong className="text-primary">{ocupacion.ocupacion_promedio}%</strong> ·{' '}
          {ocupacion.dias} días · {ocupacion.unidades_activas} unidades activas
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/20 bg-surface-bright/50">
              <th className="py-3 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider">Unidad</th>
              <th className="py-3 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider">Ocupación</th>
              <th className="py-3 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider text-right">
                Noches
              </th>
              <th className="py-3 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider text-right">
                Reservas
              </th>
              <th className="py-3 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider text-right">
                Ingresos (ARS)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {ocupacion.unidades.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-on-surface-variant">
                  No hay unidades registradas.
                </td>
              </tr>
            )}
            {ocupacion.unidades.map((u) => (
              <tr key={u.id} className="hover:bg-surface-container-low/50 transition-colors">
                <td className="py-3 px-6 text-body-medium text-on-surface">
                  {u.nombre}
                  {!u.activo && <span className="ml-2 text-caption text-on-surface-variant">(inactivo)</span>}
                </td>
                <td className="py-3 px-6 w-64">
                  <div className="flex items-center gap-3">
                    <div className="flex-grow h-2 bg-surface-variant rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${u.porcentaje >= 70 ? 'bg-tertiary' : u.porcentaje >= 40 ? 'bg-primary' : 'bg-secondary'}`}
                        style={{ width: `${u.porcentaje}%` }}
                      />
                    </div>
                    <span className="text-body-semibold text-on-surface w-10 text-right">{u.porcentaje}%</span>
                  </div>
                </td>
                <td className="py-3 px-6 text-body-base text-on-surface-variant text-right">
                  {u.noches_ocupadas} / {u.noches_disponibles}
                </td>
                <td className="py-3 px-6 text-body-base text-on-surface-variant text-right">{u.reservas}</td>
                <td className="py-3 px-6 text-body-semibold text-on-surface text-right">
                  {formatARS(u.ingresos_ars)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CierrePeriodo() {
  const { toast } = useFeedback();
  const hoy = new Date();
  const [modo, setModo] = useState('mensual');
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [cierre, setCierre] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    getCierre(anio, modo === 'mensual' ? mes : undefined)
      .then((data) => {
        if (!cancelado) setCierre(data);
      })
      .catch((err) => {
        if (!cancelado) toast(err.message, 'error');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [modo, anio, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportar(formato) {
    if (!cierre) return;
    setDescargando(formato);
    try {
      await descargarReporte(formato, cierre.desde, cierre.hasta);
      toast(`Cierre exportado a ${formato === 'excel' ? 'Excel' : 'PDF'}.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDescargando(null);
    }
  }

  const balancePositivo = cierre && cierre.balance_ars >= 0;

  return (
    <div className="bg-surface rounded-xl shadow-warm p-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-5">
        <h3 className="text-h3 text-on-surface">Cierre de período</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-outline-variant/60 overflow-hidden">
            {['mensual', 'anual'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={`h-9 px-4 text-body-semibold transition-colors ${
                  modo === m ? 'bg-primary text-on-primary' : 'bg-surface-bright text-on-surface-variant hover:bg-secondary-container/20'
                }`}
              >
                {m === 'mensual' ? 'Mensual' : 'Anual'}
              </button>
            ))}
          </div>
          {modo === 'mensual' && (
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="h-9 px-3 rounded-lg border border-outline-variant/60 bg-surface-bright text-body-base outline-none focus:border-primary"
            >
              {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map(
                (nombre, i) => (
                  <option key={nombre} value={i + 1}>
                    {nombre}
                  </option>
                )
              )}
            </select>
          )}
          <input
            type="number"
            min="2000"
            max="2100"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="h-9 w-24 px-3 rounded-lg border border-outline-variant/60 bg-surface-bright text-body-base outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={!cierre || descargando !== null}
            onClick={() => exportar('pdf')}
            className="h-9 px-3 rounded-lg border border-outline-variant/60 bg-surface-bright text-body-semibold text-on-surface hover:bg-secondary-container/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            {descargando === 'pdf' ? '…' : 'PDF'}
          </button>
          <button
            type="button"
            disabled={!cierre || descargando !== null}
            onClick={() => exportar('excel')}
            className="h-9 px-3 rounded-lg border border-outline-variant/60 bg-surface-bright text-body-semibold text-on-surface hover:bg-secondary-container/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">table_view</span>
            {descargando === 'excel' ? '…' : 'Excel'}
          </button>
        </div>
      </div>

      {cargando && <p className="text-body-base text-on-surface-variant py-6 text-center">Calculando cierre…</p>}

      {!cargando && cierre && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div className="bg-surface-container-low rounded-lg p-4">
              <p className="text-label-sm text-on-surface-variant uppercase mb-1">Ingresos</p>
              <p className="text-h3 text-tertiary">{formatARS(cierre.ingresos.total_ars)}</p>
            </div>
            <div className="bg-surface-container-low rounded-lg p-4">
              <p className="text-label-sm text-on-surface-variant uppercase mb-1">Egresos</p>
              <p className="text-h3 text-error">{formatARS(cierre.egresos.total_ars)}</p>
            </div>
            <div className="bg-surface-container-low rounded-lg p-4">
              <p className="text-label-sm text-on-surface-variant uppercase mb-1">Balance</p>
              <p className={`text-h3 ${balancePositivo ? 'text-tertiary' : 'text-error'}`}>
                {formatARS(cierre.balance_ars)}
              </p>
            </div>
            <div className="bg-surface-container-low rounded-lg p-4">
              <p className="text-label-sm text-on-surface-variant uppercase mb-1">Ocupación</p>
              <p className="text-h3 text-primary">{cierre.ocupacion_promedio}%</p>
              <p className="text-caption text-on-surface-variant">
                {cierre.reservas} reservas · {cierre.noches_ocupadas} noches
              </p>
            </div>
          </div>

          <div className="divide-y divide-outline-variant/10">
            <div className="flex justify-between py-2">
              <span className="text-body-base text-on-surface">Cobros de reservas (alojamiento)</span>
              <span className="text-body-semibold text-tertiary">
                + {formatARS(cierre.ingresos.cobros_reservas_ars)}
              </span>
            </div>
            {cierre.ingresos.movimientos.map((item) => (
              <div key={`ing-${item.categoria}`} className="flex justify-between py-2">
                <span className="text-body-base text-on-surface">Otros ingresos — {item.categoria}</span>
                <span className="text-body-semibold text-tertiary">+ {formatARS(item.total_ars)}</span>
              </div>
            ))}
            {cierre.egresos.movimientos.map((item) => (
              <div key={`egr-${item.categoria}`} className="flex justify-between py-2">
                <span className="text-body-base text-on-surface">Egresos — {item.categoria}</span>
                <span className="text-body-semibold text-error">- {formatARS(item.total_ars)}</span>
              </div>
            ))}
            <div className="flex justify-between py-3">
              <span className="text-body-semibold text-on-surface">Balance de {cierre.periodo}</span>
              <span className={`text-body-semibold ${balancePositivo ? 'text-tertiary' : 'text-error'}`}>
                {formatARS(cierre.balance_ars)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const PRESETS = [
  { value: 'mes', label: 'Este Mes' },
  { value: 'mes_anterior', label: 'Mes Anterior' },
  { value: 'tres_meses', label: 'Últimos 3 Meses' },
  { value: 'anio', label: 'Año Actual' },
];

export default function FinanzasPage() {
  const { toast, confirm } = useFeedback();
  const [preset, setPreset] = useState('mes');
  const [resumen, setResumen] = useState(null);
  const [transacciones, setTransacciones] = useState([]);
  const [ocupacion, setOcupacion] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState(null);
  const [modal, setModal] = useState(null); // null | { movimiento } | { movimiento: fila }

  const { desde, hasta } = useMemo(() => rangoPreset(preset), [preset]);

  const cargar = useCallback(() => {
    setCargando(true);
    Promise.all([
      getFinanzasResumen(desde, hasta),
      getTransacciones({ desde, hasta }),
      getOcupacion(desde, hasta),
    ])
      .then(([res, trans, ocu]) => {
        setResumen(res);
        setTransacciones(trans);
        setOcupacion(ocu);
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setCargando(false));
  }, [desde, hasta, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    getCategorias().then(setCategorias).catch(() => {});
    getDepartamentos({ activo: true }).then(setDepartamentos).catch(() => {});
  }, []);

  async function exportar(formato) {
    setDescargando(formato);
    try {
      await descargarReporte(formato, desde, hasta);
      toast(`Reporte exportado a ${formato === 'excel' ? 'Excel' : 'PDF'}.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDescargando(null);
    }
  }

  async function eliminar(fila) {
    const ok = await confirm({
      title: 'Eliminar movimiento',
      message: `¿Eliminar "${fila.descripcion}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await eliminarMovimiento(fila.id_movimiento);
      toast('Movimiento eliminado.');
      cargar();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const kpis = resumen?.kpis;

  return (
    <>
      {/* Encabezado y acciones */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-gutter gap-4">
        <div>
          <h1 className="text-h1 text-on-surface">Dashboard Financiero</h1>
          <p className="text-body-base text-on-surface-variant mt-1">
            Resumen general y estado de cuenta del complejo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-surface rounded-lg border border-outline-variant/60 px-3 h-[40px] shadow-warm">
            <span className="material-symbols-outlined text-outline text-[18px] mr-2">calendar_today</span>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="bg-transparent border-none text-on-surface text-body-medium cursor-pointer outline-none"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={descargando !== null}
            onClick={() => exportar('pdf')}
            className="border border-outline-variant/60 text-on-surface h-[40px] px-4 rounded-lg text-body-semibold hover:bg-secondary-container/10 transition-colors flex items-center gap-2 bg-surface shadow-warm disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
            {descargando === 'pdf' ? 'Generando…' : 'PDF'}
          </button>
          <button
            type="button"
            disabled={descargando !== null}
            onClick={() => exportar('excel')}
            className="border border-outline-variant/60 text-on-surface h-[40px] px-4 rounded-lg text-body-semibold hover:bg-secondary-container/10 transition-colors flex items-center gap-2 bg-surface shadow-warm disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">table_view</span>
            {descargando === 'excel' ? 'Generando…' : 'Excel'}
          </button>
          <button
            type="button"
            onClick={() => setModal({ movimiento: null })}
            className="bg-primary text-on-primary h-[40px] px-5 rounded-lg text-body-semibold hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Nuevo Movimiento
          </button>
        </div>
      </div>

      {cargando && !resumen ? (
        <div className="flex items-center justify-center h-64">
          <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>
        </div>
      ) : (
        kpis && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter mb-gutter">
              <KpiCard
                icon="trending_up"
                iconBg="bg-tertiary-container/20"
                iconColor="text-tertiary"
                label="Ingresos del período"
                value={formatARS(kpis.ingresos_ars)}
                trend={kpis.ingresos_var}
              />
              <KpiCard
                icon="trending_down"
                iconBg="bg-error-container/30"
                iconColor="text-error"
                label="Egresos del período"
                value={formatARS(kpis.egresos_ars)}
                trend={kpis.egresos_var}
                invertido
              />
              <KpiCard
                icon="account_balance"
                iconBg="bg-primary-container/30"
                iconColor="text-primary"
                label="Balance Operativo"
                value={formatARS(kpis.balance_ars)}
                valueClass={kpis.balance_ars >= 0 ? 'text-primary' : 'text-error'}
                detail={`Pendiente de cobro: ${formatARS(kpis.pendiente_cobro_ars)}`}
              />
              <KpiCard
                icon="key"
                iconBg="bg-secondary-container/50"
                iconColor="text-secondary"
                label="% Ocupación Promedio"
                value={`${kpis.ocupacion}%`}
                trend={kpis.ocupacion_var}
                detail={`Basado en ${kpis.unidades_activas} unidades`}
              />
            </div>

            {/* Gráfico */}
            <div className="mb-gutter">
              <GraficoIngresoEgreso serie={resumen.serie} />
            </div>

            {/* Movimientos */}
            <div className="mb-gutter">
              <TablaTransacciones
                filas={transacciones}
                cargando={cargando}
                onEditar={(fila) => setModal({ movimiento: fila })}
                onEliminar={eliminar}
              />
            </div>

            {/* Ocupación por unidad */}
            <div className="mb-gutter">
              <TablaOcupacion ocupacion={ocupacion} />
            </div>

            {/* Cierre de período */}
            <CierrePeriodo />
          </>
        )
      )}

      {modal && (
        <MovimientoModal
          movimiento={modal.movimiento}
          categorias={categorias}
          departamentos={departamentos}
          onClose={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            cargar();
            getCategorias().then(setCategorias).catch(() => {});
          }}
        />
      )}
    </>
  );
}
