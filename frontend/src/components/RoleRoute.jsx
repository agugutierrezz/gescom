import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Separa las áreas por rol: el ADMIN solo ve la gestión de usuarios y el
 * OPERADOR el resto del sistema. Si el rol no coincide, redirige a su área.
 */
export default function RoleRoute({ rol }) {
  const { user } = useAuth();
  if (user?.rol !== rol) {
    return <Navigate to={user?.rol === 'ADMIN' ? '/usuarios' : '/'} replace />;
  }
  return <Outlet />;
}
