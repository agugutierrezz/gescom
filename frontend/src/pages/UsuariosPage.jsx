import { useCallback, useEffect, useMemo, useState } from 'react';
import { cambiarEstadoUsuario, crearUsuario, getUsuarios, renombrarUsuario } from '../api/usuarios';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';

function formatFecha(isoFecha) {
  const fecha = new Date(isoFecha);
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function UsuarioModal({ usuario, onClose, onGuardado }) {
  const { toast } = useFeedback();
  const esEdicion = Boolean(usuario);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    nombre: usuario?.nombre || '',
    password: '',
    confirmar: '',
  });

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    if (!esEdicion && form.password !== form.confirmar) {
      toast('Las contraseñas no coinciden.', 'error');
      return;
    }
    setGuardando(true);
    try {
      if (esEdicion) {
        await renombrarUsuario(usuario.id, form.nombre.trim());
        toast('Nombre de usuario actualizado.');
      } else {
        await crearUsuario(form.nombre.trim(), form.password);
        toast('Cuenta creada con éxito.');
      }
      onGuardado();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface-container-lowest rounded-xl shadow-warm w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-h3 text-on-surface">
            {esEdicion ? `Renombrar "${usuario.nombre}"` : 'Nueva cuenta de operador'}
          </h3>
          <button type="button" onClick={onClose} className="text-outline hover:text-on-surface" aria-label="Cerrar">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={guardar} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-label-sm text-on-surface-variant">Nombre de usuario</span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={100}
              pattern="[a-zA-Z0-9_.\-]+"
              title="Letras, números, punto, guion y guion bajo (sin espacios)"
              placeholder="Ej: puntapiedras"
              value={form.nombre}
              onChange={set('nombre')}
              className="h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none"
            />
            <span className="text-caption text-on-surface-variant">
              Es el usuario con el que el complejo inicia sesión.
            </span>
          </label>

          {!esEdicion && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-label-sm text-on-surface-variant">Contraseña</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={set('password')}
                  className="h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none"
                />
                <span className="text-caption text-on-surface-variant">Mínimo 8 caracteres.</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-label-sm text-on-surface-variant">Confirmar contraseña</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.confirmar}
                  onChange={set('confirmar')}
                  className="h-11 px-3 rounded-lg border border-outline-variant bg-surface-bright focus:border-primary outline-none"
                />
              </label>
            </>
          )}

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
              {guardando ? 'Guardando…' : esEdicion ? 'Guardar' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const { user } = useAuth();
  const { toast, confirm } = useFeedback();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [modal, setModal] = useState(null); // null | { usuario: null } | { usuario }

  const cargar = useCallback(() => {
    setCargando(true);
    getUsuarios()
      .then(setUsuarios)
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setCargando(false));
  }, [toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (q && !u.nombre.toLowerCase().includes(q)) return false;
      if (filtroEstado === 'activos' && !u.activo) return false;
      if (filtroEstado === 'inactivos' && u.activo) return false;
      return true;
    });
  }, [usuarios, busqueda, filtroEstado]);

  async function toggleEstado(u) {
    const accion = u.activo ? 'Desactivar' : 'Activar';
    const ok = await confirm({
      title: `${accion} cuenta`,
      message: u.activo
        ? `"${u.nombre}" no podrá iniciar sesión hasta que la reactives. Sus datos (departamentos, reservas, movimientos) se conservan.`
        : `"${u.nombre}" volverá a poder iniciar sesión.`,
      confirmLabel: accion,
      danger: u.activo,
    });
    if (!ok) return;
    try {
      await cambiarEstadoUsuario(u.id, !u.activo);
      toast(`Cuenta ${u.activo ? 'desactivada' : 'activada'}.`);
      cargar();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const activos = usuarios.filter((u) => u.activo).length;

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-gutter gap-4">
        <div>
          <h1 className="text-h1 text-on-surface">Gestión de Usuarios</h1>
          <p className="text-body-base text-on-surface-variant mt-1">
            Cuentas de acceso al sistema: {activos} activas de {usuarios.length} en total.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ usuario: null })}
          className="bg-primary text-on-primary h-[40px] px-5 rounded-lg text-body-semibold hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm"
        >
          <span className="material-symbols-outlined text-[20px]">person_add</span>
          Nueva Cuenta
        </button>
      </div>

      <div className="bg-surface rounded-xl shadow-warm overflow-hidden">
        <div className="p-6 border-b border-outline-variant/20 flex flex-col md:flex-row justify-between md:items-center gap-3">
          <h3 className="text-h3 text-on-surface">Cuentas</h3>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="h-9 px-3 rounded-lg border border-outline-variant/60 bg-surface-bright text-body-base outline-none focus:border-primary"
            >
              <option value="">Todas</option>
              <option value="activos">Activas</option>
              <option value="inactivos">Inactivas</option>
            </select>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar usuario..."
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
                {['Usuario', 'Rol', 'Estado', 'Creado', 'Departamentos', 'Reservas'].map((h) => (
                  <th key={h} className="py-3 px-6 text-label-sm text-on-surface-variant uppercase tracking-wider">
                    {h}
                  </th>
                ))}
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {cargando && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-on-surface-variant">
                    Cargando cuentas…
                  </td>
                </tr>
              )}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-on-surface-variant">
                    No hay cuentas para los filtros seleccionados.
                  </td>
                </tr>
              )}
              {!cargando &&
                visibles.map((u) => {
                  const esAdmin = u.rol === 'ADMIN';
                  const esYo = u.id === user?.id;
                  return (
                    <tr key={u.id} className="hover:bg-surface-container-low/50 transition-colors group">
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-secondary-container/40 flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined text-[20px]">
                              {esAdmin ? 'shield_person' : 'person'}
                            </span>
                          </div>
                          <div>
                            <p className="text-body-medium text-on-surface">
                              {u.nombre}
                              {esYo && <span className="ml-2 text-caption text-on-surface-variant">(vos)</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-6">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold ${
                            esAdmin ? 'bg-primary-container/30 text-primary' : 'bg-surface-variant text-on-surface-variant'
                          }`}
                        >
                          {esAdmin ? 'Administrador' : 'Operador'}
                        </span>
                      </td>
                      <td className="py-3 px-6">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-semibold ${
                            u.activo ? 'bg-tertiary-container/20 text-tertiary' : 'bg-error-container/50 text-error'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${u.activo ? 'bg-tertiary' : 'bg-error'}`} />
                          {u.activo ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-body-base text-on-surface-variant whitespace-nowrap">
                        {formatFecha(u.created_at)}
                      </td>
                      <td className="py-3 px-6 text-body-base text-on-surface-variant">{u.cant_departamentos}</td>
                      <td className="py-3 px-6 text-body-base text-on-surface-variant">{u.cant_reservas}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setModal({ usuario: u })}
                            className="p-1 text-outline hover:text-primary transition-colors"
                            aria-label={`Renombrar ${u.nombre}`}
                            title="Renombrar"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          {!esYo && (
                            <button
                              type="button"
                              onClick={() => toggleEstado(u)}
                              className={`p-1 text-outline transition-colors ${
                                u.activo ? 'hover:text-error' : 'hover:text-tertiary'
                              }`}
                              aria-label={`${u.activo ? 'Desactivar' : 'Activar'} ${u.nombre}`}
                              title={u.activo ? 'Desactivar' : 'Activar'}
                            >
                              <span className="material-symbols-outlined text-[20px]">
                                {u.activo ? 'person_off' : 'how_to_reg'}
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-caption text-on-surface-variant">
        Las contraseñas las cambia cada usuario desde la pantalla "Olvidé mi contraseña" del login.
        La cuenta de administrador solo se recupera por consola en el servidor.
      </p>

      {modal && (
        <UsuarioModal
          usuario={modal.usuario}
          onClose={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            cargar();
          }}
        />
      )}
    </>
  );
}
