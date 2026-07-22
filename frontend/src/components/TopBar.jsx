import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function TopBar({ title = 'Resumen General', onMenuClick }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <header className="flex justify-between items-center h-16 md:h-20 px-4 sm:px-6 md:px-margin-desktop w-full md:w-[calc(100%-256px)] top-0 md:ml-sidebar-width fixed z-30 backdrop-blur-sm bg-background/80">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden flex items-center justify-center w-10 h-10 -ml-2 rounded-lg text-on-surface hover:bg-secondary-container/30 transition-colors"
          aria-label="Abrir menú"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <h2 className="text-h3 md:text-h2 text-on-surface truncate">{title}</h2>
      </div>
      <div className="flex items-center gap-3 md:gap-6 shrink-0">
        <div className="flex items-center gap-2 text-on-surface-variant" title={user?.nombre}>
          <span className="material-symbols-outlined">account_circle</span>
          {user?.nombre && (
            <span className="text-body-medium text-on-surface hidden sm:inline">{user.nombre}</span>
          )}
        </div>
        {pathname === '/' && (
          <button
            type="button"
            onClick={() => navigate('/reservas/nueva')}
            className="h-10 px-3 md:px-4 bg-primary text-on-primary text-body-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span className="hidden sm:inline">Nueva Reserva</span>
          </button>
        )}
      </div>
    </header>
  );
}
