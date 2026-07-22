import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_OPERADOR = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/reservas', label: 'Reservas', icon: 'calendar_month' },
  { to: '/departamentos', label: 'Departamentos', icon: 'apartment' },
  { to: '/disponibilidad', label: 'Disponibilidad', icon: 'event_available' },
  { to: '/finanzas', label: 'Finanzas', icon: 'payments' },
];

// El administrador solo gestiona cuentas; el resto del sistema es del operador.
const NAV_ADMIN = [{ to: '/usuarios', label: 'Usuarios', icon: 'group', end: true }];

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const NAV_ITEMS = user?.rol === 'ADMIN' ? NAV_ADMIN : NAV_OPERADOR;

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      {/* Backdrop mobile */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <nav
        className={`bg-surface-container-low w-sidebar-width h-screen fixed left-0 top-0 flex flex-col p-gutter z-50 md:z-40 border-r border-outline-variant/20 transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="mb-6 flex items-center justify-between">
          <img src="/logo.png" alt="GESCOM" className="h-12 w-auto" />
          <button
            type="button"
            onClick={onClose}
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg text-on-surface-variant hover:bg-secondary-container/30 transition-colors"
            aria-label="Cerrar menú"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <ul className="flex flex-col gap-2 w-full">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  isActive
                    ? 'flex items-center gap-3 px-4 py-3 text-primary text-body-semibold bg-secondary-container/50 rounded-lg scale-[0.98] transition-all duration-200'
                    : 'flex items-center gap-3 px-4 py-3 text-on-surface-variant text-body-base hover:bg-secondary-container/30 transition-colors rounded-lg'
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`material-symbols-outlined ${isActive ? 'icon-filled' : ''}`}>
                      {item.icon}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-4 border-t border-outline-variant/20">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 text-[#C0473A] text-body-base hover:bg-[#C0473A]/5 transition-colors rounded-lg mt-1"
          >
            <span className="material-symbols-outlined">logout</span>
            Cerrar sesión
          </button>
        </div>
      </nav>
    </>
  );
}
