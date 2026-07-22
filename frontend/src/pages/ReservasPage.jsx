import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeedback } from '../context/FeedbackContext';
import { getDepartamentos } from '../api/departamentos';
import {
  getReservas,
  cancelarReserva,
  descargarPdfReserva,
  getPagos,
  registrarPago,
  eliminarPago,
} from '../api/reservas';

const PAGE_SIZE = 10;

const ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'PARCIAL', label: 'Parcial' },
  { value: 'PAGADO', label: 'Pagado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

const BADGES = {
  PENDIENTE: { label: 'Pendiente', className: 'bg-secondary/10 text-secondary' },
  PARCIAL: { label: 'Parcial', className: 'bg-primary/10 text-primary' },
  PAGADO: { label: 'Pagado', className: 'bg-tertiary/10 text-tertiary' },
  CANCELADO: { label: 'Cancelado', className: 'bg-error/10 text-error' },
};

const fmtARS = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtFecha(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function EstadoBadge({ estado }) {
  const badge = BADGES[estado] || BADGES.PENDIENTE;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold ${badge.className}`}>
      {badge.label}
    </span>
  );
}

const MEDIOS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'];

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Cancelación de reserva con devolución opcional (genera un EGRESO). */
function CancelarModal({ reserva, onClose, onConfirmar, procesando }) {
  const [devolver, setDevolver] = useState(false);
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState('ARS');
  const [error, setError] = useState('');

  function confirmar() {
    setError('');
    let devolucion = null;
    if (devolver) {
      const valor = Number(monto);
      if (!valor || valor <= 0) {
        setError('Ingresá el monto que devolviste.');
        return;
      }
      devolucion = { devolucion_monto: valor, devolucion_moneda: moneda };
    }
    onConfirmar(devolucion);
  }

  const inputClass =
    'h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface-container-lowest rounded-xl shadow-warm w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-h3 text-on-surface">Cancelar reserva</h3>
          <button type="button" onClick={onClose} className="text-outline hover:text-on-surface" aria-label="Cerrar">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="text-body-base text-on-surface-variant mb-4">
          ¿Seguro que querés cancelar la reserva de{' '}
          <span className="font-semibold text-on-surface">{reserva.cliente}</span> en{' '}
          {reserva.departamento_nombre}? Las fechas quedarán liberadas.
        </p>

        {error && (
          <div className="bg-error-container/60 text-on-error-container rounded-lg px-3 py-2 text-body-base mb-4">
            {error}
          </div>
        )}

        <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={devolver}
            onChange={(e) => setDevolver(e.target.checked)}
            className="w-4 h-4 accent-primary-container"
          />
          <span className="text-body-base text-on-surface">Le devolví dinero al cliente</span>
        </label>

        {devolver && (
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-label-sm text-on-surface-variant">Monto devuelto</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-label-sm text-on-surface-variant">Moneda</span>
                <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={inputClass}>
                  <option value="ARS">ARS (pesos)</option>
                  <option value="USD">USD (dólares)</option>
                </select>
              </label>
            </div>
            <p className="text-caption text-on-surface-variant mt-2">
              Se registrará un egreso "Devolución" con fecha de hoy en {reserva.departamento_nombre}.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={procesando}
            className="h-10 px-5 border border-[#C8A96E]/30 text-on-surface text-body-semibold rounded-lg hover:bg-surface-variant/20 transition-colors"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={procesando}
            className="h-10 px-5 bg-error text-on-error text-body-semibold rounded-lg shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2"
          >
            {procesando && (
              <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
            )}
            Cancelar reserva
          </button>
        </div>
      </div>
    </div>
  );
}

/** CU02 — Registrar pago de reserva */
function PagoModal({ reserva: reservaInicial, onClose, onReservaChange }) {
  const { toast, confirm } = useFeedback();
  const [reserva, setReserva] = useState(reservaInicial);
  const [pagos, setPagos] = useState(null); // null = cargando
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState({
    fecha_pago: hoyISO(),
    monto: '',
    moneda: 'USD',
    medio_pago: 'Efectivo',
    concepto: '',
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function saldoDe(moneda) {
    return moneda === 'USD'
      ? Number(reserva.saldo_usd).toFixed(2)
      : Number(reserva.saldo_pesos).toFixed(2);
  }

  function cambiarMoneda(moneda) {
    setForm((f) => {
      if (f.moneda === moneda) return f;
      // Si el monto era el saldo pendiente, recalcularlo en la nueva moneda
      const monto = f.monto === saldoDe(f.moneda) ? saldoDe(moneda) : f.monto;
      return { ...f, moneda, monto };
    });
  }

  const cargarPagos = useCallback(() => {
    getPagos(reservaInicial.id)
      .then(setPagos)
      .catch((err) => setError(err.message || 'No se pudo cargar el historial.'));
  }, [reservaInicial.id]);

  useEffect(() => {
    cargarPagos();
  }, [cargarPagos]);

  function actualizarReserva(actualizada) {
    setReserva(actualizada);
    onReservaChange(actualizada);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (document.getElementById('pago_monto')?.validity.badInput) {
      return setError(
        'El monto tiene un valor no numérico. Ingresá solo dígitos sin separador de miles (para decimales usá coma, ej: 500000 o 500000,50).'
      );
    }
    const monto = Number(form.monto);
    if (!form.fecha_pago) return setError('Ingresá la fecha del pago.');
    if (!monto || monto <= 0) return setError('El monto debe ser mayor a 0.');

    const saldoUsd = Number(reserva.saldo_usd);
    const montoUsdEquiv = form.moneda === 'USD' ? monto : monto / Number(reserva.tipo_cambio);

    // Flujo alternativo CU02: advertencia si el monto supera el saldo pendiente.
    let permitirExcedente = false;
    if (montoUsdEquiv - saldoUsd > 0.01) {
      const ok = await confirm({
        title: 'El pago supera el saldo',
        message: `El pago equivale a USD ${montoUsdEquiv.toFixed(2)} y el saldo pendiente es USD ${saldoUsd.toFixed(
          2
        )}. ¿Registrarlo de todas formas?`,
        confirmLabel: 'Registrar igual',
        danger: true,
      });
      if (!ok) return;
      permitirExcedente = true;
    }

    setSaving(true);
    try {
      const actualizada = await registrarPago(reserva.id, {
        fecha_pago: form.fecha_pago,
        monto,
        moneda: form.moneda,
        medio_pago: form.medio_pago || null,
        concepto: form.concepto.trim() || null,
        permitir_excedente: permitirExcedente,
      });
      actualizarReserva(actualizada);
      setForm((f) => ({ ...f, monto: '', concepto: '' }));
      cargarPagos();
      toast(
        actualizada.estado === 'PAGADO'
          ? 'Pago registrado. La reserva quedó saldada.'
          : 'Pago registrado con éxito.'
      );
    } catch (err) {
      setError(err.message || 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEliminar(pago) {
    const ok = await confirm({
      title: 'Eliminar pago',
      message: `¿Eliminar el pago "${pago.concepto || 'Pago'}" del ${fmtFecha(pago.fecha_pago)}? El saldo y el estado de la reserva se recalcularán.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(pago.id);
    setError('');
    try {
      const actualizada = await eliminarPago(reserva.id, pago.id);
      actualizarReserva(actualizada);
      cargarPagos();
      toast('Pago eliminado.');
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el pago.');
    } finally {
      setDeletingId(null);
    }
  }

  const sinSaldo = Number(reserva.saldo_usd) <= 0.01;
  const inputClass =
    'w-full px-4 py-2 bg-transparent border border-[#C8A96E]/30 rounded-lg focus:border-primary-container focus:ring-0 text-body-base text-on-surface placeholder:text-outline-variant h-[48px]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-xl shadow-warm w-full max-w-4xl p-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-h2 text-on-surface">Pagos de la reserva</h3>
            <p className="text-body-base text-on-surface-variant">
              {reserva.cliente} — {reserva.departamento_nombre} ({fmtFecha(reserva.fecha_ingreso)} al{' '}
              {fmtFecha(reserva.fecha_egreso)})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-outline hover:text-on-surface rounded-lg transition-colors"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Resumen de cuenta */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-surface-container-low/50 border border-outline-variant/30 rounded-lg p-3">
            <span className="block text-body-base text-on-surface-variant mb-0.5">Total</span>
            <span className="block text-h3 text-on-surface">
              USD {fmtUSD.format(Number(reserva.total_usd))}
            </span>
            <span className="block text-body-base text-on-surface-variant">
              $ {fmtARS.format(Number(reserva.total_pesos))}
            </span>
          </div>
          <div className="bg-surface-container-low/50 border border-outline-variant/30 rounded-lg p-3">
            <span className="block text-body-base text-on-surface-variant mb-0.5">Pagado</span>
            <span className="block text-h3 text-tertiary">
              USD {fmtUSD.format(Number(reserva.total_pagado_usd))}
            </span>
          </div>
          <div className="bg-surface-container-low/50 border border-outline-variant/30 rounded-lg p-3">
            <span className="block text-body-base text-on-surface-variant mb-0.5">Saldo pendiente</span>
            <span className={`block text-h3 ${sinSaldo ? 'text-tertiary' : 'text-primary'}`}>
              USD {fmtUSD.format(Number(reserva.saldo_usd))}
            </span>
            <span className="block text-body-base text-on-surface-variant">
              $ {fmtARS.format(Number(reserva.saldo_pesos))}
            </span>
          </div>
        </div>

        {/* Historial */}
        <div className="border border-outline-variant/30 rounded-lg overflow-hidden mb-4">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-low/40">
                <th className="py-2 px-3 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Fecha</th>
                <th className="py-2 px-3 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Concepto</th>
                <th className="py-2 px-3 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Medio</th>
                <th className="py-2 px-3 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold text-right">Monto</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {pagos === null && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  </td>
                </tr>
              )}
              {pagos?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 px-3 text-center text-body-base text-on-surface-variant">
                    Sin pagos registrados todavía.
                  </td>
                </tr>
              )}
              {pagos?.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 px-3 text-body-base text-on-surface-variant">{fmtFecha(p.fecha_pago)}</td>
                  <td className="py-2 px-3 text-body-base text-on-surface">{p.concepto || (p.tipo === 'CARGO' ? 'Cargo' : 'Pago')}</td>
                  <td className="py-2 px-3 text-body-base text-on-surface-variant">{p.medio_pago || '—'}</td>
                  <td className="py-2 px-3 text-body-medium text-on-surface text-right">
                    {p.moneda === 'USD' ? 'USD ' + fmtUSD.format(Number(p.monto_final)) : '$ ' + fmtARS.format(Number(p.monto_final))}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleEliminar(p)}
                      disabled={deletingId === p.id}
                      className="p-1 text-outline hover:text-[#C86A5E] hover:bg-[#C86A5E]/10 rounded transition-colors disabled:opacity-40"
                      title="Eliminar pago"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {deletingId === p.id ? 'progress_activity' : 'delete'}
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Formulario de registro */}
        {sinSaldo ? (
          <div className="flex items-center gap-2 bg-tertiary/10 text-tertiary rounded-lg px-4 py-3 text-body-base">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            La reserva no tiene saldo pendiente.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Registrar pago</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-body-base text-on-surface-variant mb-1.5" htmlFor="pago_fecha">Fecha</label>
                <input
                  id="pago_fecha"
                  type="date"
                  value={form.fecha_pago}
                  onChange={(e) => set('fecha_pago', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-body-base text-on-surface-variant" htmlFor="pago_monto">Monto</label>
                  <button
                    type="button"
                    onClick={() => set('monto', saldoDe(form.moneda))}
                    className="text-caption text-primary hover:underline"
                    title="Completar con el saldo pendiente"
                  >
                    Usar saldo pendiente
                  </button>
                </div>
                <div className="flex">
                  <input
                    id="pago_monto"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.monto}
                    onChange={(e) => set('monto', e.target.value)}
                    placeholder="0.00"
                    className="flex-1 min-w-0 px-4 py-2 bg-transparent border border-[#C8A96E]/30 border-r-0 rounded-l-lg focus:border-primary-container focus:ring-0 text-body-lg text-on-surface placeholder:text-outline-variant h-[48px]"
                    autoFocus
                  />
                  <div className="flex border border-[#C8A96E]/30 rounded-r-lg overflow-hidden">
                    {['USD', 'ARS'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => cambiarMoneda(m)}
                        className={
                          form.moneda === m
                            ? 'px-3 text-label-sm font-semibold bg-secondary-container/50 text-on-secondary-container'
                            : 'px-3 text-label-sm text-on-surface-variant hover:bg-surface-variant/30 transition-colors'
                        }
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-body-base text-on-surface-variant mb-1.5" htmlFor="pago_medio">Medio de pago</label>
                <select
                  id="pago_medio"
                  value={form.medio_pago}
                  onChange={(e) => set('medio_pago', e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  {MEDIOS_PAGO.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-body-base text-on-surface-variant mb-1.5" htmlFor="pago_concepto">Concepto</label>
                <input
                  id="pago_concepto"
                  type="text"
                  value={form.concepto}
                  onChange={(e) => set('concepto', e.target.value)}
                  maxLength={255}
                  placeholder="Ej: Segunda cuota"
                  className={inputClass}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-error-container/50 text-error rounded-lg px-4 py-2 text-body-base">
                <span className="material-symbols-outlined text-[20px]">error</span>
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="h-10 px-6 bg-primary-container hover:bg-surface-tint text-on-primary text-body-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {saving && (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                )}
                Registrar pago
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ReservasPage() {
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [reservas, setReservas] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagina, setPagina] = useState(1);
  const [accionandoId, setAccionandoId] = useState(null);
  const [pagoModal, setPagoModal] = useState(null); // reserva seleccionada
  const [cancelModal, setCancelModal] = useState(null); // reserva a cancelar

  const [filtros, setFiltros] = useState({
    q: '',
    departamentoId: '',
    estado: '',
    fechaDesde: '',
    fechaHasta: '',
  });

  function setFiltro(field, value) {
    setFiltros((f) => ({ ...f, [field]: value }));
    setPagina(1);
  }

  useEffect(() => {
    getDepartamentos()
      .then(setDepartamentos)
      .catch(() => {});
  }, []);

  const cargar = useCallback(async (f) => {
    setError('');
    try {
      const data = await getReservas(f);
      setReservas(data);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las reservas.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Consulta al backend con debounce al cambiar cualquier filtro.
  useEffect(() => {
    const timer = setTimeout(() => cargar(filtros), filtros.q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filtros, cargar]);

  // Las canceladas solo se ven filtrando por estado "Cancelado".
  const filtradas = reservas.filter(
    (r) => filtros.estado === 'CANCELADO' || r.estado !== 'CANCELADO'
  );
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filtradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  function handleCancelar(reserva) {
    setCancelModal(reserva);
  }

  async function confirmarCancelacion(devolucion) {
    const reserva = cancelModal;
    setAccionandoId(reserva.id);
    setError('');
    try {
      const actualizada = await cancelarReserva(reserva.id, devolucion);
      setReservas((prev) => prev.map((r) => (r.id === reserva.id ? actualizada : r)));
      toast(
        devolucion
          ? 'Reserva cancelada. La devolución quedó registrada como egreso en Finanzas.'
          : 'Reserva cancelada.'
      );
      setCancelModal(null);
    } catch (err) {
      setCancelModal(null);
      setError(err.message || 'No se pudo cancelar la reserva.');
    } finally {
      setAccionandoId(null);
    }
  }

  async function handlePdf(reserva) {
    setAccionandoId(reserva.id);
    setError('');
    try {
      await descargarPdfReserva(reserva.id);
      toast('Comprobante PDF descargado.');
    } catch (err) {
      setError(err.message || 'No se pudo descargar el PDF.');
    } finally {
      setAccionandoId(null);
    }
  }

  const filtroInput =
    'w-full h-10 px-3 bg-transparent border border-[#C8A96E]/30 rounded-lg focus:border-primary-container focus:ring-0 text-body-base text-on-surface placeholder:text-outline-variant';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-primary text-[32px]">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-gutter">
      {error && (
        <div className="flex items-center gap-2 bg-error-container/50 text-error rounded-lg px-4 py-2 text-body-base">
          <span className="material-symbols-outlined text-[20px]">error</span>
          {error}
        </div>
      )}

      {/* Filtros (consulta avanzada) + alta */}
      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-warm flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-1.5">
            Cliente
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
              search
            </span>
            <input
              type="text"
              value={filtros.q}
              onChange={(e) => setFiltro('q', e.target.value)}
              placeholder="Buscar cliente..."
              className={`${filtroInput} pl-10`}
            />
          </div>
        </div>
        <div className="min-w-[130px]">
          <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-1.5">
            Desde
          </label>
          <input
            type="date"
            value={filtros.fechaDesde}
            onChange={(e) => setFiltro('fechaDesde', e.target.value)}
            className={filtroInput}
          />
        </div>
        <div className="min-w-[130px]">
          <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-1.5">
            Hasta
          </label>
          <input
            type="date"
            value={filtros.fechaHasta}
            min={filtros.fechaDesde || undefined}
            onChange={(e) => setFiltro('fechaHasta', e.target.value)}
            className={filtroInput}
          />
        </div>
        <div className="min-w-[170px]">
          <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-1.5">
            Departamento
          </label>
          <select
            value={filtros.departamentoId}
            onChange={(e) => setFiltro('departamentoId', e.target.value)}
            className={`${filtroInput} cursor-pointer`}
          >
            <option value="">Todos</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-1.5">
            Estado
          </label>
          <select
            value={filtros.estado}
            onChange={(e) => setFiltro('estado', e.target.value)}
            className={`${filtroInput} cursor-pointer`}
          >
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => navigate('/reservas/nueva')}
          className="h-10 px-6 bg-primary-container hover:bg-surface-tint text-on-primary text-body-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Nueva Reserva
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-surface-container-lowest rounded-xl shadow-warm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#C8A96E]/10">
                {['Cliente', 'Departamento', 'Ingreso', 'Egreso'].map((h) => (
                  <th key={h} className="py-4 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                    {h}
                  </th>
                ))}
                <th className="py-4 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold text-right">
                  Monto ARS
                </th>
                <th className="py-4 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold text-right">
                  Monto USD
                </th>
                <th className="py-4 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold text-center">
                  Estado
                </th>
                <th className="py-4 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold text-center">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8A96E]/10">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-body-base text-on-surface-variant">
                    {filtradas.length === 0
                      ? 'No hay reservas para los filtros seleccionados. Creá una con "Nueva Reserva".'
                      : 'No se encontraron reservas en esta página.'}
                  </td>
                </tr>
              )}
              {visibles.map((r) => {
                const cancelada = r.estado === 'CANCELADO';
                const dim = cancelada ? 'opacity-60' : '';
                return (
                  <tr key={r.id} className={`hover:bg-surface-container-low/50 transition-colors ${dim}`}>
                    <td className="py-4 px-6 text-body-medium text-on-surface">{r.cliente}</td>
                    <td className="py-4 px-6 text-body-base text-on-surface-variant">
                      {r.departamento_nombre || '—'}
                    </td>
                    <td className="py-4 px-6 text-body-base text-on-surface-variant">
                      {fmtFecha(r.fecha_ingreso)}
                    </td>
                    <td className="py-4 px-6 text-body-base text-on-surface-variant">
                      {fmtFecha(r.fecha_egreso)}
                    </td>
                    <td className="py-4 px-6 text-body-medium text-on-surface text-right">
                      $ {fmtARS.format(Number(r.total_pesos))}
                      {Number(r.descuento_usd) > 0 && (
                        <span
                          className="material-symbols-outlined text-[14px] text-tertiary ml-1 align-middle"
                          title={`Con descuento aplicado (− USD ${fmtUSD.format(Number(r.descuento_usd))})`}
                        >
                          sell
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-body-base text-on-surface-variant text-right">
                      USD {fmtUSD.format(Number(r.total_usd))}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <EstadoBadge estado={r.estado} />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPagoModal(r)}
                          disabled={cancelada}
                          className="p-2 text-outline hover:text-tertiary hover:bg-tertiary/10 rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-outline"
                          title={cancelada ? 'La reserva está cancelada' : 'Registrar pago / ver pagos'}
                        >
                          <span className="material-symbols-outlined text-[20px]">payments</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/reservas/${r.id}/editar`)}
                          disabled={cancelada}
                          className="p-2 text-outline hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-outline"
                          title={cancelada ? 'No se puede editar una reserva cancelada' : 'Editar'}
                        >
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelar(r)}
                          disabled={cancelada || accionandoId === r.id}
                          className="p-2 text-outline hover:text-[#C86A5E] hover:bg-[#C86A5E]/10 rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-outline"
                          title={cancelada ? 'La reserva ya está cancelada' : 'Cancelar reserva'}
                        >
                          <span className="material-symbols-outlined text-[20px]">
                            {accionandoId === r.id ? 'progress_activity' : 'cancel'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePdf(r)}
                          disabled={accionandoId === r.id}
                          className="p-2 text-outline hover:text-on-surface hover:bg-surface-variant/30 rounded-lg transition-colors disabled:opacity-40"
                          title="Descargar PDF"
                        >
                          <span className="material-symbols-outlined text-[20px]">description</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between text-on-surface-variant text-caption">
        <span>
          Mostrando {filtradas.length === 0 ? 0 : (paginaActual - 1) * PAGE_SIZE + 1}-
          {Math.min(paginaActual * PAGE_SIZE, filtradas.length)} de {filtradas.length} reservas
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={paginaActual === 1}
            className="w-8 h-8 rounded flex items-center justify-center border border-[#C8A96E]/30 text-on-surface disabled:text-outline-variant disabled:cursor-not-allowed hover:bg-surface-variant/20 transition-colors"
            aria-label="Página anterior"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPagina(n)}
              className={`w-8 h-8 rounded flex items-center justify-center border border-[#C8A96E]/30 ${
                n === paginaActual
                  ? 'bg-surface-container-lowest text-on-surface text-body-semibold'
                  : 'text-on-surface-variant hover:bg-surface-variant/20 transition-colors'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={paginaActual === totalPaginas}
            className="w-8 h-8 rounded flex items-center justify-center border border-[#C8A96E]/30 text-on-surface disabled:text-outline-variant disabled:cursor-not-allowed hover:bg-surface-variant/20 transition-colors"
            aria-label="Página siguiente"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>

      {cancelModal && (
        <CancelarModal
          reserva={cancelModal}
          onClose={() => setCancelModal(null)}
          onConfirmar={confirmarCancelacion}
          procesando={accionandoId === cancelModal.id}
        />
      )}

      {pagoModal && (
        <PagoModal
          reserva={pagoModal}
          onClose={() => setPagoModal(null)}
          onReservaChange={(actualizada) =>
            setReservas((prev) => prev.map((r) => (r.id === actualizada.id ? actualizada : r)))
          }
        />
      )}
    </div>
  );
}
