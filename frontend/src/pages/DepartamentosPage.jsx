import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFeedback } from '../context/FeedbackContext';
import {
  getDepartamentos,
  crearDepartamento,
  actualizarDepartamento,
  cambiarEstadoDepartamento,
} from '../api/departamentos';

const PAGE_SIZE = 10;
const FILTROS_ESTADO = [
  { value: 'todos', label: 'Todos' },
  { value: 'activos', label: 'Activos' },
  { value: 'inactivos', label: 'Inactivos' },
];

function EstadoBadge({ activo }) {
  return activo ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#7A9A8A]/20 text-tertiary text-label-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
      Activo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-outline-variant/30 text-outline text-label-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-outline" />
      Inactivo
    </span>
  );
}

function DepartamentoModal({ departamento, onClose, onSaved }) {
  const { toast } = useFeedback();
  const editando = Boolean(departamento);
  const [form, setForm] = useState({
    nombre: departamento?.nombre ?? '',
    descripcion: departamento?.descripcion ?? '',
    capacidad_maxima: departamento?.capacidad_maxima ?? 2,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const nombre = form.nombre.trim();
    const capacidad = Number(form.capacidad_maxima);
    if (!nombre) return setError('El nombre es obligatorio.');
    if (!Number.isInteger(capacidad) || capacidad < 1) {
      return setError('La capacidad máxima debe ser un entero mayor o igual a 1.');
    }

    const payload = {
      nombre,
      descripcion: form.descripcion.trim() || null,
      capacidad_maxima: capacidad,
    };

    setSaving(true);
    try {
      if (editando) {
        await actualizarDepartamento(departamento.id, payload);
        toast('Cambios del departamento guardados.');
      } else {
        await crearDepartamento(payload);
        toast(`Departamento "${nombre}" creado con éxito.`);
      }
      onSaved();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el departamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-xl shadow-warm w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-h3 text-on-surface">
            {editando ? 'Editar departamento' : 'Nuevo departamento'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-outline hover:text-on-surface rounded-lg transition-colors"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-1.5">
              Nombre *
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              maxLength={100}
              placeholder="Ej: Cabaña 1"
              className="w-full px-4 py-2 bg-transparent border border-[#C8A96E]/30 rounded-lg focus:border-primary-container focus:ring-0 text-body-base text-on-surface placeholder:text-outline-variant h-[40px]"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-1.5">
              Descripción
            </label>
            <textarea
              value={form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Ej: Vista al mar, 2 habitaciones, terraza privada."
              className="w-full px-4 py-2 bg-transparent border border-[#C8A96E]/30 rounded-lg focus:border-primary-container focus:ring-0 text-body-base text-on-surface placeholder:text-outline-variant resize-none"
            />
          </div>

          <div>
            <label className="block text-label-sm text-on-surface-variant uppercase tracking-wider mb-1.5">
              Capacidad máxima *
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={form.capacidad_maxima}
              onChange={(e) => set('capacidad_maxima', e.target.value)}
              className="w-32 px-4 py-2 bg-transparent border border-[#C8A96E]/30 rounded-lg focus:border-primary-container focus:ring-0 text-body-base text-on-surface h-[40px]"
            />
            <span className="ml-2 text-caption text-on-surface-variant">personas</span>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-error-container/50 text-error rounded-lg px-4 py-2 text-body-base">
              <span className="material-symbols-outlined text-[20px]">error</span>
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 border border-[#C8A96E]/30 text-on-surface text-body-medium rounded-lg hover:bg-surface-variant/20 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-6 bg-primary-container hover:bg-surface-tint text-on-primary text-body-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {saving && (
                <span className="material-symbols-outlined animate-spin text-[18px]">
                  progress_activity
                </span>
              )}
              {editando ? 'Guardar cambios' : 'Crear departamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DepartamentosPage() {
  const { toast, confirm } = useFeedback();
  const [departamentos, setDepartamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activos'); // por defecto solo activos
  const [pagina, setPagina] = useState(1);
  const [modal, setModal] = useState(null); // null | { departamento: null | {...} }
  const [togglingId, setTogglingId] = useState(null);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const data = await getDepartamentos();
      setDepartamentos(data);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los departamentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return departamentos.filter((d) => {
      if (q && !d.nombre.toLowerCase().includes(q)) return false;
      if (filtroEstado === 'activos' && !d.activo) return false;
      if (filtroEstado === 'inactivos' && d.activo) return false;
      return true;
    });
  }, [departamentos, busqueda, filtroEstado]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  async function handleToggleEstado(dep) {
    const accion = dep.activo ? 'desactivar' : 'activar';
    const ok = await confirm({
      title: `${dep.activo ? 'Desactivar' : 'Activar'} departamento`,
      message: dep.activo
        ? `¿Seguro que querés desactivar "${dep.nombre}"? No admitirá nuevas reservas hasta reactivarlo.`
        : `¿Reactivar "${dep.nombre}"? Volverá a admitir reservas.`,
      confirmLabel: dep.activo ? 'Desactivar' : 'Activar',
      danger: dep.activo,
    });
    if (!ok) return;

    setTogglingId(dep.id);
    setError('');
    try {
      const actualizado = await cambiarEstadoDepartamento(dep.id, !dep.activo);
      setDepartamentos((prev) => prev.map((d) => (d.id === dep.id ? actualizado : d)));
      toast(`Departamento ${dep.activo ? 'desactivado' : 'activado'}.`);
    } catch (err) {
      setError(err.message || `No se pudo ${accion} el departamento.`);
    } finally {
      setTogglingId(null);
    }
  }

  function handleSaved() {
    setModal(null);
    setLoading(true);
    cargar();
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

  return (
    <div className="flex flex-col gap-gutter">
      {error && (
        <div className="flex items-center gap-2 bg-error-container/50 text-error rounded-lg px-4 py-2 text-body-base">
          <span className="material-symbols-outlined text-[20px]">error</span>
          {error}
        </div>
      )}

      {/* Barra de búsqueda / filtros / alta */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-surface-container-lowest p-4 rounded-xl shadow-warm">
        <div className="relative w-64">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
            search
          </span>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
            placeholder="Buscar departamento..."
            className="w-full pl-10 pr-4 py-2 bg-transparent border border-[#C8A96E]/30 rounded-lg focus:border-primary-container focus:ring-0 text-body-base text-on-surface placeholder:text-outline-variant h-[40px]"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[#C8A96E]/30 overflow-hidden">
            {FILTROS_ESTADO.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setFiltroEstado(f.value);
                  setPagina(1);
                }}
                className={
                  filtroEstado === f.value
                    ? 'h-[40px] px-4 bg-secondary-container/50 text-primary text-body-medium'
                    : 'h-[40px] px-4 text-on-surface-variant text-body-medium hover:bg-surface-variant/20 transition-colors'
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setModal({ departamento: null })}
            className="h-10 px-6 bg-primary-container hover:bg-surface-tint text-on-primary text-body-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Nuevo Departamento
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-surface-container-lowest rounded-xl shadow-warm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#C8A96E]/10">
                <th className="py-4 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                  Nombre
                </th>
                <th className="py-4 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                  Descripción
                </th>
                <th className="py-4 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold text-center">
                  Capacidad máxima
                </th>
                <th className="py-4 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                  Estado
                </th>
                <th className="py-4 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8A96E]/10">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-body-base text-on-surface-variant">
                    {departamentos.length === 0
                      ? 'Todavía no cargaste departamentos. Creá el primero con "Nuevo Departamento".'
                      : 'No se encontraron departamentos con esos filtros.'}
                  </td>
                </tr>
              )}
              {visibles.map((dep) => (
                <tr
                  key={dep.id}
                  className={`hover:bg-surface-container-low/50 transition-colors ${
                    dep.activo ? '' : 'bg-surface-variant/10'
                  }`}
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg bg-surface-variant/30 flex items-center justify-center ${
                          dep.activo ? 'text-primary' : 'text-outline-variant'
                        }`}
                      >
                        <span className="material-symbols-outlined">key</span>
                      </div>
                      <span
                        className={`text-body-semibold ${
                          dep.activo ? 'text-on-surface' : 'text-outline'
                        }`}
                      >
                        {dep.nombre}
                      </span>
                    </div>
                  </td>
                  <td
                    className={`py-4 px-6 text-body-base max-w-[300px] truncate ${
                      dep.activo ? 'text-on-surface-variant' : 'text-outline'
                    }`}
                    title={dep.descripcion || ''}
                  >
                    {dep.descripcion || '—'}
                  </td>
                  <td
                    className={`py-4 px-6 text-body-base text-center ${
                      dep.activo ? 'text-on-surface' : 'text-outline'
                    }`}
                  >
                    {dep.capacidad_maxima} {dep.capacidad_maxima === 1 ? 'persona' : 'personas'}
                  </td>
                  <td className="py-4 px-6">
                    <EstadoBadge activo={dep.activo} />
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setModal({ departamento: dep })}
                        className="p-2 text-outline hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleEstado(dep)}
                        disabled={togglingId === dep.id}
                        className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                          dep.activo
                            ? 'text-outline hover:text-[#C86A5E] hover:bg-[#C86A5E]/10'
                            : 'text-outline hover:text-tertiary hover:bg-tertiary/10'
                        }`}
                        title={dep.activo ? 'Desactivar' : 'Activar'}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {togglingId === dep.id
                            ? 'progress_activity'
                            : dep.activo
                              ? 'block'
                              : 'check_circle'}
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between text-on-surface-variant text-caption">
        <span>
          Mostrando {filtrados.length === 0 ? 0 : (paginaActual - 1) * PAGE_SIZE + 1}-
          {Math.min(paginaActual * PAGE_SIZE, filtrados.length)} de {filtrados.length} departamentos
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

      {modal && (
        <DepartamentoModal
          departamento={modal.departamento}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
