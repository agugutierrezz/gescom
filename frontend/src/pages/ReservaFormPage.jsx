import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFeedback } from '../context/FeedbackContext';
import { getDepartamentos } from '../api/departamentos';
import { crearReserva, actualizarReserva, getReserva, getTipoCambio } from '../api/reservas';

const fmtARS = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MEDIOS_PAGO = ['Transferencia', 'Efectivo', 'Tarjeta', 'Otro'];

export default function ReservaFormPage() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useFeedback();

  const [departamentos, setDepartamentos] = useState([]);
  const [cotizacion, setCotizacion] = useState(null); // { venta, fecha_actualizacion }
  const [tipoCambio, setTipoCambio] = useState(null); // valor usado para calcular
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    cliente: '',
    id_departamento: '',
    fecha_ingreso: '',
    fecha_egreso: '',
    monto: '',
    moneda: 'USD',
    sena: '',
    sena_moneda: 'ARS',
    sena_medio_pago: 'Transferencia',
    descuento_tipo: '',
    descuento_valor: '',
    observaciones: '',
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        const [deps, cot, reserva] = await Promise.all([
          getDepartamentos({ activo: true }),
          getTipoCambio().catch(() => null),
          editando ? getReserva(id) : Promise.resolve(null),
        ]);
        if (cancelado) return;
        setDepartamentos(deps);
        setCotizacion(cot);
        if (reserva) {
          setForm({
            cliente: reserva.cliente,
            id_departamento: String(reserva.id_departamento),
            fecha_ingreso: reserva.fecha_ingreso,
            fecha_egreso: reserva.fecha_egreso,
            monto: String(reserva.monto_usd),
            moneda: 'USD',
            sena: '',
            sena_moneda: 'ARS',
            sena_medio_pago: 'Transferencia',
            descuento_tipo: reserva.descuento_tipo || '',
            descuento_valor: reserva.descuento_valor ? String(reserva.descuento_valor) : '',
            observaciones: reserva.observaciones || '',
          });
          // Al editar se conserva el tipo de cambio original de la reserva.
          setTipoCambio(Number(reserva.tipo_cambio));
          // El departamento de la reserva puede estar inactivo: lo sumamos igual al select.
          if (!deps.some((d) => d.id === reserva.id_departamento) && reserva.departamento_nombre) {
            setDepartamentos([
              ...deps,
              { id: reserva.id_departamento, nombre: `${reserva.departamento_nombre} (inactivo)` },
            ]);
          }
        } else if (cot) {
          setTipoCambio(cot.venta);
        }
      } catch (err) {
        if (!cancelado) setError(err.message || 'No se pudieron cargar los datos.');
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [id, editando]);

  const montos = useMemo(() => {
    const monto = Number(form.monto);
    if (!tipoCambio || !monto || monto <= 0) {
      return { usd: 0, ars: 0, descuentoUsd: 0, totalUsd: 0, totalArs: 0 };
    }
    const usd = form.moneda === 'USD' ? monto : monto / tipoCambio;
    const valor = Number(form.descuento_valor);
    let descuentoUsd = 0;
    if (form.descuento_tipo && valor > 0) {
      descuentoUsd = form.descuento_tipo === 'PORCENTAJE' ? (usd * valor) / 100 : valor;
    }
    const totalUsd = Math.max(0, usd - descuentoUsd);
    return { usd, ars: usd * tipoCambio, descuentoUsd, totalUsd, totalArs: totalUsd * tipoCambio };
  }, [form.monto, form.moneda, form.descuento_tipo, form.descuento_valor, tipoCambio]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // El input type="number" devuelve '' cuando el valor no es numérico (ej: "500.000"
    // con punto de miles). badInput permite distinguirlo de un campo vacío real.
    const camposNumericos = [
      ['monto', 'Monto de reserva'],
      ['sena', 'Seña aplicada'],
      ['descuento_valor', 'Valor del descuento'],
    ];
    for (const [idCampo, etiqueta] of camposNumericos) {
      const el = document.getElementById(idCampo);
      if (el?.validity.badInput) {
        return setError(
          `"${etiqueta}" tiene un valor no numérico. Ingresá solo dígitos sin separador de miles (para decimales usá coma, ej: 500000 o 500000,50).`
        );
      }
    }

    const cliente = form.cliente.trim();
    const monto = Number(form.monto);
    const sena = form.sena === '' ? null : Number(form.sena);
    if (!cliente) return setError('El cliente es obligatorio.');
    if (!form.id_departamento) return setError('Seleccioná un departamento.');
    if (!form.fecha_ingreso || !form.fecha_egreso) return setError('Completá las fechas de ingreso y egreso.');
    if (form.fecha_egreso <= form.fecha_ingreso) {
      return setError('La fecha de egreso debe ser posterior a la de ingreso.');
    }
    if (!monto || monto <= 0) return setError('El monto de la reserva debe ser mayor a 0.');
    if (sena !== null && (Number.isNaN(sena) || sena < 0)) return setError('La seña no puede ser negativa.');
    if (!tipoCambio) return setError('No hay tipo de cambio disponible. Recargá la página.');

    const descValor = Number(form.descuento_valor);
    if (form.descuento_tipo) {
      if (!descValor || descValor <= 0) return setError('Ingresá el valor del descuento.');
      if (form.descuento_tipo === 'PORCENTAJE' && descValor > 100) {
        return setError('El descuento porcentual no puede superar el 100%.');
      }
      if (form.descuento_tipo === 'MONTO' && descValor > montos.usd) {
        return setError('El descuento no puede superar el monto de la reserva.');
      }
    }
    if (sena !== null) {
      const senaUsd = form.sena_moneda === 'USD' ? sena : sena / tipoCambio;
      if (senaUsd > montos.totalUsd) {
        return setError('La seña no puede superar el total de la reserva (con descuento aplicado).');
      }
    }

    const payload = {
      cliente,
      id_departamento: Number(form.id_departamento),
      fecha_ingreso: form.fecha_ingreso,
      fecha_egreso: form.fecha_egreso,
      monto,
      moneda: form.moneda,
      tipo_cambio: tipoCambio,
      descuento_tipo: form.descuento_tipo || null,
      descuento_valor: form.descuento_tipo ? descValor : null,
      observaciones: form.observaciones.trim() || null,
    };
    if (!editando && sena) {
      payload.sena = sena;
      payload.sena_moneda = form.sena_moneda;
      payload.sena_medio_pago = form.sena_medio_pago || null;
    }

    setSaving(true);
    try {
      if (editando) {
        await actualizarReserva(id, payload);
        toast('Cambios de la reserva guardados.');
      } else {
        await crearReserva(payload);
        toast(`Reserva de ${cliente} creada con éxito.`);
      }
      navigate('/reservas');
    } catch (err) {
      setError(err.message || 'No se pudo guardar la reserva.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-primary text-[32px]">
          progress_activity
        </span>
      </div>
    );
  }

  const inputClass =
    'w-full px-4 py-3 bg-surface-container-lowest border border-[#C8A96E]/30 rounded-lg focus:border-primary-container focus:ring-0 text-body-base text-on-surface placeholder:text-outline-variant';

  return (
    <div className="max-w-[800px] mx-auto">
      <button
        type="button"
        onClick={() => navigate('/reservas')}
        className="flex items-center gap-2 mb-4 text-on-surface-variant hover:text-primary transition-colors text-body-medium"
      >
        <span className="material-symbols-outlined">arrow_back</span>
        Volver al listado
      </button>

      <div className="bg-surface-container-lowest rounded-xl shadow-warm p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-gutter gap-y-6">
            {/* Cliente y departamento */}
            <div>
              <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="cliente">
                Cliente *
              </label>
              <input
                id="cliente"
                type="text"
                value={form.cliente}
                onChange={(e) => set('cliente', e.target.value)}
                maxLength={255}
                placeholder="Datos del cliente"
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="departamento">
                Departamento *
              </label>
              <div className="relative">
                <select
                  id="departamento"
                  value={form.id_departamento}
                  onChange={(e) => set('id_departamento', e.target.value)}
                  className={`${inputClass} appearance-none pr-10`}
                >
                  <option value="" disabled>
                    Seleccionar unidad...
                  </option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  expand_more
                </span>
              </div>
            </div>

            {/* Fechas */}
            <div>
              <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="fecha_ingreso">
                Fecha ingreso *
              </label>
              <input
                id="fecha_ingreso"
                type="date"
                value={form.fecha_ingreso}
                onChange={(e) => set('fecha_ingreso', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="fecha_egreso">
                Fecha egreso *
              </label>
              <input
                id="fecha_egreso"
                type="date"
                value={form.fecha_egreso}
                min={form.fecha_ingreso || undefined}
                onChange={(e) => set('fecha_egreso', e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Monto, seña y conversiones */}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-gutter">
              <div className="space-y-6">
                <div>
                  <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="monto">
                    Monto de reserva *
                  </label>
                  <div className="flex">
                    <input
                      id="monto"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.monto}
                      onChange={(e) => set('monto', e.target.value)}
                      placeholder="0.00"
                      className="flex-1 min-w-0 px-4 py-3 bg-surface-container-lowest border border-[#C8A96E]/30 border-r-0 rounded-l-lg focus:border-primary-container focus:ring-0 text-body-base text-on-surface placeholder:text-outline-variant"
                    />
                    <div className="flex border border-[#C8A96E]/30 rounded-r-lg overflow-hidden">
                      {['USD', 'ARS'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => set('moneda', m)}
                          className={
                            form.moneda === m
                              ? 'px-3 text-label-sm bg-secondary-container/50 text-on-secondary-container font-semibold'
                              : 'px-3 text-label-sm text-on-surface-variant hover:bg-surface-variant/30 transition-colors'
                          }
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {!editando && (
                  <div>
                    <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="sena">
                      Seña aplicada
                    </label>
                    <div className="flex">
                      <input
                        id="sena"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.sena}
                        onChange={(e) => set('sena', e.target.value)}
                        placeholder="0.00"
                        className="flex-1 min-w-0 px-4 py-3 bg-surface-container-lowest border border-[#C8A96E]/30 border-r-0 rounded-l-lg focus:border-primary-container focus:ring-0 text-body-base text-on-surface placeholder:text-outline-variant"
                      />
                      <div className="flex border border-[#C8A96E]/30 rounded-r-lg overflow-hidden">
                        {['ARS', 'USD'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => set('sena_moneda', m)}
                            className={
                              form.sena_moneda === m
                                ? 'px-3 text-label-sm bg-secondary-container/50 text-on-secondary-container font-semibold'
                                : 'px-3 text-label-sm text-on-surface-variant hover:bg-surface-variant/30 transition-colors'
                            }
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    {Number(form.sena) > 0 && (
                      <div className="mt-2 relative">
                        <select
                          value={form.sena_medio_pago}
                          onChange={(e) => set('sena_medio_pago', e.target.value)}
                          aria-label="Medio de pago de la seña"
                          className={`${inputClass} appearance-none pr-8 cursor-pointer`}
                        >
                          {MEDIOS_PAGO.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant">
                          expand_more
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="descuento_tipo">
                    Descuento
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        id="descuento_tipo"
                        value={form.descuento_tipo}
                        onChange={(e) => {
                          set('descuento_tipo', e.target.value);
                          if (!e.target.value) set('descuento_valor', '');
                        }}
                        className={`${inputClass} appearance-none pr-8`}
                      >
                        <option value="">Sin descuento</option>
                        <option value="PORCENTAJE">Porcentaje (%)</option>
                        <option value="MONTO">Monto (USD)</option>
                      </select>
                      <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant">
                        expand_more
                      </span>
                    </div>
                    {form.descuento_tipo && (
                      <div className="relative w-32">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-base text-on-surface-variant">
                          {form.descuento_tipo === 'PORCENTAJE' ? '%' : 'U$D'}
                        </span>
                        <input
                          id="descuento_valor"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.descuento_valor}
                          onChange={(e) => set('descuento_valor', e.target.value)}
                          placeholder="0"
                          className={`${inputClass} ${form.descuento_tipo === 'PORCENTAJE' ? 'pl-8' : 'pl-11'}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-surface-container-low/50 p-4 rounded-xl border border-outline-variant/30 space-y-4 h-fit">
                <div>
                  <label className="block text-caption text-on-surface-variant mb-1">
                    {editando ? 'Tipo de cambio de la reserva' : 'Tipo de cambio actual (oficial venta)'}
                  </label>
                  <div className="text-body-semibold text-primary">
                    {tipoCambio ? `$ ${fmtARS.format(tipoCambio)} ARS/USD` : 'No disponible'}
                  </div>
                  {!editando && cotizacion && (
                    <p className="text-caption text-on-surface-variant mt-0.5">
                      dolarapi.com —{' '}
                      {new Date(cotizacion.fecha_actualizacion).toLocaleString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      hs
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">Monto en Pesos</label>
                    <div className="bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-body-medium text-on-surface-variant">
                      $ {fmtARS.format(montos.ars)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-caption text-on-surface-variant mb-1">Monto en Dólares</label>
                    <div className="bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-body-medium text-on-surface-variant">
                      U$D {fmtUSD.format(montos.usd)}
                    </div>
                  </div>
                </div>
                {montos.descuentoUsd > 0 && (
                  <div className="pt-3 border-t border-outline-variant/30">
                    <div className="flex justify-between text-body-base text-on-surface-variant mb-1">
                      <span>Descuento</span>
                      <span className="text-error">− U$D {fmtUSD.format(montos.descuentoUsd)}</span>
                    </div>
                    <div className="flex justify-between text-body-semibold text-on-surface">
                      <span>Total</span>
                      <span className="text-primary">
                        U$D {fmtUSD.format(montos.totalUsd)} · $ {fmtARS.format(montos.totalArs)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Observaciones */}
            <div className="md:col-span-2">
              <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="observaciones">
                Observaciones
              </label>
              <textarea
                id="observaciones"
                value={form.observaciones}
                onChange={(e) => set('observaciones', e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Detalles adicionales, requerimientos especiales..."
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-error-container/50 text-error rounded-lg px-4 py-2 text-body-base">
              <span className="material-symbols-outlined text-[20px]">error</span>
              {error}
            </div>
          )}

          <div className="pt-6 border-t border-outline-variant/30 flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/reservas')}
              className="h-10 px-6 border border-[#C8A96E]/30 text-on-surface text-body-semibold rounded-lg hover:bg-surface-variant/20 transition-colors flex items-center"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-6 bg-primary-container hover:bg-surface-tint text-on-primary text-body-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {saving ? (
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[18px]">check</span>
              )}
              {editando ? 'Guardar cambios' : 'Guardar Reserva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
