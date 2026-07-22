import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DepartamentosPage from './pages/DepartamentosPage';
import ReservasPage from './pages/ReservasPage';
import ReservaFormPage from './pages/ReservaFormPage';
import DisponibilidadPage from './pages/DisponibilidadPage';
import FinanzasPage from './pages/FinanzasPage';
import UsuariosPage from './pages/UsuariosPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Área del operador */}
          <Route element={<RoleRoute rol="OPERADOR" />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/departamentos" element={<DepartamentosPage />} />
            <Route path="/reservas" element={<ReservasPage />} />
            <Route path="/reservas/nueva" element={<ReservaFormPage />} />
            <Route path="/reservas/:id/editar" element={<ReservaFormPage />} />
            <Route path="/disponibilidad" element={<DisponibilidadPage />} />
            <Route path="/finanzas" element={<FinanzasPage />} />
          </Route>

          {/* Área del administrador */}
          <Route element={<RoleRoute rol="ADMIN" />}>
            <Route path="/usuarios" element={<UsuariosPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
