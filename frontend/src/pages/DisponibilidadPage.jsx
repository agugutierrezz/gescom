import { useEffect, useMemo, useState } from 'react';
import { useFeedback } from '../context/FeedbackContext';
import { getDepartamentos } from '../api/departamentos';
import { getReservas } from '../api/reservas';
import { descargarPdfDisponibilidad } from '../api/disponibilidad';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS_SEMANA = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoDe(anio, mes, dia) {
  return `${anio}-${pad(mes)}-${pad(dia)}`;
}

function hoyISO() {
  const d = new Date();
  return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function fmtFecha(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Codificación de colores (RF-03):
 *   GRIS = fecha pasada · VERDE = disponible · ROJO = ocupado ·
 *   AMARILLO = intercambio (fecha de ingreso o egreso de una reserva).
 * Los días intermedios de una reserva (ingreso < día < egreso) van en rojo.
 */
function estadoDia(iso, reservas, hoy) {
  if (iso < hoy) return 'PASADO';
  if (reservas.some((r) => r.fecha_ingreso === iso || r.fecha_egreso === iso)) {
    return 'INTERCAMBIO';
  }
  if (reservas.some((r) => r.fecha_ingreso < iso && iso < r.fecha_egreso)) {
    return 'OCUPADO';
  }
  return 'DISPONIBLE';
}

const ESTILOS_DIA = {
  PASADO: 'bg-surface-variant/70 opacity-60',
  DISPONIBLE: 'bg-tertiary-fixed/30 hover:bg-tertiary-fixed/50',
  OCUPADO: 'bg-error-container/50 border-l-4 border-error hover:bg-error-container/70',
  INTERCAMBIO:
    'bg-secondary-container/50 border-l-4 border-secondary-fixed-dim hover:bg-secondary-container/70',
  OTRO_MES: 'bg-surface-container-low/60',
};

const LEYENDA = [
  { label: 'PASADO', className: 'bg-surface-variant border border-outline/30' },
  { label: 'DISPONIBLE', className: 'bg-tertiary-fixed' },
  { label: 'OCUPADO', className: 'bg-error-container border border-error/30' },
  { label: 'INTERCAMBIO (IN/OUT)', className: 'bg-secondary-container border border-secondary/20' },
];

const BADGES = {
  PENDIENTE: { label: 'Pendiente', className: 'bg-secondary/10 text-secondary' },
  PARCIAL: { label: 'Parcial', className: 'bg-primary/10 text-primary' },
  PAGADO: { label: 'Pagado', className: 'bg-tertiary/10 text-tertiary' },
};

/** Celdas del mes: todos los días del mes + relleno de meses adyacentes para completar semanas. */
function construirCeldas(anio, mes) {
  const primerDow = new Date(anio, mes - 1, 1).getDay(); // 0 = domingo
  const diasMes = new Date(anio, mes, 0).getDate();
  const diasMesAnterior = new Date(anio, mes - 1, 0).getDate();
  const celdas = [];

  for (let i = primerDow - 1; i >= 0; i--) {
    celdas.push({ dia: diasMesAnterior - i, otroMes: true });
  }
  for (let d = 1; d <= diasMes; d++) {
    celdas.push({ dia: d, otroMes: false, iso: isoDe(anio, mes, d) });
  }
  let siguiente = 1;
  while (celdas.length % 7 !== 0) {
    celdas.push({ dia: siguiente++, otroMes: true });
  }
  return celdas;
}

function DiaCelda({ celda, reservas, hoy }) {
  if (celda.otroMes) {
    return (
      <div className={`min-h-[84px] p-2 relative ${ESTILOS_DIA.OTRO_MES}`}>
        <span className="text-body-base text-outline-variant absolute top-2 right-2">
          {celda.dia}
        </span>
      </div>
    );
  }

  const estado = estadoDia(celda.iso, reservas, hoy);
  const checkIn = reservas.find((r) => r.fecha_ingreso === celda.iso);
  const checkOut = reservas.find((r) => r.fecha_egreso === celda.iso);
  const ocupadaPor = reservas.find((r) => r.fecha_ingreso < celda.iso && celda.iso < r.fecha_egreso);
  const esHoy = celda.iso === hoy;

  const tooltip =
    estado === 'INTERCAMBIO'
      ? [checkOut && `Check-out: ${checkOut.cliente}`, checkIn && `Check-in: ${checkIn.cliente}`]
          .filter(Boolean)
          .join(' · ')
      : estado === 'OCUPADO' && ocupadaPor
        ? ocupadaPor.cliente
        : null;

  return (
    <div
      className={`min-h-[84px] p-2 relative group transition-colors ${ESTILOS_DIA[estado]}`}
    >
      <span
        className={`text-body-medium absolute top-2 right-2 ${
          estado === 'PASADO'
            ? 'text-outline'
            : esHoy
              ? 'w-7 h-7 -mt-1 -mr-1 flex items-center justify-center rounded-full bg-primary text-on-primary font-semibold'
              : 'text-on-surface'
        }`}
      >
        {celda.dia}
      </span>

      {estado === 'INTERCAMBIO' && (
        <div className="mt-7 flex flex-col gap-0.5">
          {checkOut && (
            <span className="flex items-center gap-1 text-caption text-on-secondary-container font-medium">
              <span className="material-symbols-outlined text-[14px]">logout</span> Check-out
            </span>
          )}
          {checkIn && (
            <span className="flex items-center gap-1 text-caption text-on-secondary-container font-medium">
              <span className="material-symbols-outlined text-[14px]">login</span> Check-in
            </span>
          )}
        </div>
      )}

      {tooltip && (
        <div className="absolute inset-x-0 bottom-full mb-1 hidden group-hover:block z-10 bg-inverse-surface text-inverse-on-surface px-2 py-1.5 rounded text-caption text-center shadow-lg whitespace-nowrap left-1/2 -translate-x-1/2 w-max max-w-[240px]">
          {tooltip}
        </div>
      )}
    </div>
  );
}

export default function DisponibilidadPage() {
  const { toast } = useFeedback();
  const ahora = new Date();

  const [departamentos, setDepartamentos] = useState(null); // null = cargando
  const [departamentoId, setDepartamentoId] = useState(null);
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1); // 1-12
  const [reservas, setReservas] = useState([]);
  const [cargandoReservas, setCargandoReservas] = useState(false);
  const [exportando, setExportando] = useState(false);

  const hoy = hoyISO();

  useEffect(() => {
    getDepartamentos({ activo: true })
      .then((deptos) => {
        setDepartamentos(deptos);
        if (deptos.length > 0) setDepartamentoId(deptos[0].id);
      })
      .catch((err) => {
        setDepartamentos([]);
        toast(err.message || 'No se pudieron cargar los departamentos.', 'error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!departamentoId) return;
    const fechaDesde = isoDe(anio, mes, 1);
    const fechaHasta = isoDe(anio, mes, new Date(anio, mes, 0).getDate());
    setCargandoReservas(true);
    getReservas({ departamentoId, fechaDesde, fechaHasta })
      .then((rs) => setReservas(rs.filter((r) => r.estado !== 'CANCELADO')))
      .catch((err) => {
        setReservas([]);
        toast(err.message || 'No se pudo consultar la disponibilidad.', 'error');
      })
      .finally(() => setCargandoReservas(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departamentoId, anio, mes]);

  function cambiarMes(delta) {
    const fecha = new Date(anio, mes - 1 + delta, 1);
    setAnio(fecha.getFullYear());
    setMes(fecha.getMonth() + 1);
  }

  async function handleExportar() {
    if (!departamentoId) return;
    setExportando(true);
    try {
      await descargarPdfDisponibilidad(departamentoId, anio, mes);
      toast('Calendario exportado a PDF.');
    } catch (err) {
      toast(err.message || 'No se pudo exportar el PDF.', 'error');
    } finally {
      setExportando(false);
    }
  }

  const celdas = useMemo(() => construirCeldas(anio, mes), [anio, mes]);

  const reservasDelMes = useMemo(
    () => [...reservas].sort((a, b) => a.fecha_ingreso.localeCompare(b.fecha_ingreso)),
    [reservas]
  );

  if (departamentos === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-primary text-[32px]">
          progress_activity
        </span>
      </div>
    );
  }

  if (departamentos.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-xl shadow-warm p-12 text-center">
        <span className="material-symbols-outlined text-[40px] text-outline mb-3 block">
          apartment
        </span>
        <p className="text-body-lg text-on-surface mb-1">No hay departamentos activos.</p>
        <p className="text-body-base text-on-surface-variant">
          Cree un departamento para consultar su disponibilidad.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-gutter">
      {/* Calendario */}
      <div className="bg-surface-container-lowest rounded-xl shadow-warm overflow-hidden">
        {/* Controles: cabaña + navegación de mes + exportar */}
        <div className="p-6 border-b border-outline-variant/20 flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex flex-wrap gap-1 bg-surface-container-low p-1 rounded-lg">
            {departamentos.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDepartamentoId(d.id)}
                className={
                  d.id === departamentoId
                    ? 'px-4 py-2 rounded-md bg-surface-container-lowest text-primary text-body-medium shadow-sm'
                    : 'px-4 py-2 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 text-body-base transition-all'
                }
              >
                {d.nombre}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => cambiarMes(-1)}
              aria-label="Mes anterior"
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors border border-outline-variant/30"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <div className="border border-outline-variant/50 rounded-lg px-4 py-2 min-w-[180px] text-center bg-surface-container-lowest">
              <span className="text-body-semibold text-on-surface">
                {MESES[mes - 1]} {anio}
              </span>
            </div>
            <button
              type="button"
              onClick={() => cambiarMes(1)}
              aria-label="Mes siguiente"
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors border border-outline-variant/30"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>

            <button
              type="button"
              onClick={handleExportar}
              disabled={exportando}
              className="h-10 px-4 bg-surface-container-lowest border border-outline-variant text-on-surface text-body-medium rounded-lg hover:bg-surface-variant/40 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span
                className={`material-symbols-outlined text-[20px] ${exportando ? 'animate-spin' : ''}`}
              >
                {exportando ? 'progress_activity' : 'picture_as_pdf'}
              </span>
              Exportar a PDF
            </button>
          </div>
        </div>

        {/* Leyenda */}
        <div className="px-6 py-4 border-b border-outline-variant/20 flex flex-wrap gap-6 items-center">
          {LEYENDA.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${item.className}`}></div>
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">
                {item.label}
              </span>
            </div>
          ))}
          {cargandoReservas && (
            <span className="material-symbols-outlined animate-spin text-primary text-[20px] ml-auto">
              progress_activity
            </span>
          )}
        </div>

        {/* Grilla */}
        <div className="p-4 md:p-6 overflow-x-auto">
          <div className="grid grid-cols-7 gap-px min-w-[560px] bg-outline-variant/20 rounded-lg overflow-hidden border border-outline-variant/30">
            {DIAS_SEMANA.map((d) => (
              <div
                key={d}
                className="bg-surface-container-low text-center py-3 text-label-sm text-on-surface-variant uppercase tracking-wider"
              >
                {d}
              </div>
            ))}
            {celdas.map((celda, i) => (
              <DiaCelda key={i} celda={celda} reservas={reservas} hoy={hoy} />
            ))}
          </div>
        </div>
      </div>

      {/* Reservas del mes */}
      <div className="bg-surface-container-lowest rounded-xl shadow-warm overflow-hidden">
        <div className="px-6 pt-5 pb-3 border-b border-outline-variant/20">
          <h3 className="text-h3 text-on-surface">
            Reservas de {MESES[mes - 1]} {anio}
          </h3>
        </div>
        {reservasDelMes.length === 0 ? (
          <p className="px-6 py-8 text-body-base text-on-surface-variant text-center">
            Sin reservas en el mes seleccionado.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className="text-left px-6 py-3 text-label-sm text-on-surface-variant uppercase tracking-wider">
                  Cliente
                </th>
                <th className="text-left px-6 py-3 text-label-sm text-on-surface-variant uppercase tracking-wider">
                  Fecha Inicio
                </th>
                <th className="text-left px-6 py-3 text-label-sm text-on-surface-variant uppercase tracking-wider">
                  Fecha Fin
                </th>
                <th className="text-left px-6 py-3 text-label-sm text-on-surface-variant uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {reservasDelMes.map((r) => {
                const badge = BADGES[r.estado] || BADGES.PENDIENTE;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/50 transition-colors"
                  >
                    <td className="px-6 py-3.5 text-body-medium text-on-surface">{r.cliente}</td>
                    <td className="px-6 py-3.5 text-body-base text-on-surface-variant">
                      {fmtFecha(r.fecha_ingreso)}
                    </td>
                    <td className="px-6 py-3.5 text-body-base text-on-surface-variant">
                      {fmtFecha(r.fecha_egreso)}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
