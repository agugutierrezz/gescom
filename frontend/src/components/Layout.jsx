import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const TITLES = {
  '/': 'Resumen General',
  '/reservas': 'Listado de Reservas',
  '/reservas/nueva': 'Nueva Reserva',
  '/departamentos': 'Departamentos',
  '/disponibilidad': 'Disponibilidad',
  '/finanzas': 'Finanzas',
};

function resolveTitle(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  if (/^\/reservas\/\d+\/editar$/.test(pathname)) return 'Editar Reserva';
  return 'GESCOM';
}

export default function Layout() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <TopBar title={resolveTitle(pathname)} onMenuClick={() => setMenuOpen(true)} />
      <main className="md:ml-sidebar-width pt-20 md:pt-24 px-4 sm:px-6 md:px-margin-desktop pb-6 md:pb-margin-desktop min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
