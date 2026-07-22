import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(nombre, password, remember);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Credenciales inválidas');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background p-6">
      {/* Fondo ambiental */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-surface-container-highest rounded-full mix-blend-multiply blur-[100px] opacity-40 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-secondary-fixed rounded-full mix-blend-multiply blur-[120px] opacity-20 pointer-events-none" />

        <main className="w-full max-w-[520px] relative z-10">
          <div className="bg-surface-container-lowest rounded-[12px] shadow-warm p-8 sm:p-12 w-full flex flex-col items-center">
            {/* Marca */}
            <div className="mb-10 flex flex-col items-center">
              <img src="/logo.png" alt="GESCOM" className="h-20 w-auto" />
            </div>

            {/* Formulario */}
            <form className="w-full flex flex-col gap-6" onSubmit={handleSubmit}>
              {error && (
                <div className="flex items-center gap-2 bg-error-container/60 text-on-error-container rounded-[8px] px-3 py-2 text-body-base">
                  <span className="material-symbols-outlined text-[20px]">error</span>
                  {error}
                </div>
              )}

              {/* Usuario */}
              <div className="flex flex-col gap-2">
                <label className="text-body-medium text-on-surface" htmlFor="nombre">
                  Usuario
                </label>
                <div className="relative flex items-center border border-[#C8A96E]/30 rounded-[8px] bg-surface-container-lowest focus-within:border-primary transition-colors duration-200">
                  <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[20px]">
                    person
                  </span>
                  <input
                    id="nombre"
                    type="text"
                    required
                    autoComplete="username"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ingresa tu usuario"
                    className="w-full pl-10 pr-4 py-2 bg-transparent border-none focus:ring-0 focus:outline-none text-body-base text-on-surface placeholder:text-outline-variant h-[48px] rounded-[8px]"
                  />
                </div>
              </div>

              {/* Contraseña */}
              <div className="flex flex-col gap-2">
                <label className="text-body-medium text-on-surface" htmlFor="password">
                  Contraseña
                </label>
                <div className="relative flex items-center border border-[#C8A96E]/30 rounded-[8px] bg-surface-container-lowest focus-within:border-primary transition-colors duration-200">
                  <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[20px]">
                    lock
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2 bg-transparent border-none focus:ring-0 focus:outline-none text-body-base text-on-surface placeholder:text-outline-variant h-[48px] rounded-[8px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-3 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? 'visibility' : 'visibility_off'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Recordarme */}
              <div className="flex items-center gap-2 mt-1">
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-[18px] h-[18px] rounded-[4px] border-outline text-primary-container focus:ring-primary-container bg-surface-container-lowest cursor-pointer"
                />
                <label
                  htmlFor="remember"
                  className="text-body-medium text-on-surface-variant cursor-pointer select-none"
                >
                  Recordarme en este equipo
                </label>
              </div>

              {/* Enviar */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full h-[48px] mt-4 bg-primary-container hover:bg-primary disabled:opacity-60 text-on-primary text-body-semibold rounded-[8px] transition-colors duration-200 shadow-sm flex items-center justify-center gap-2"
              >
                <span>{submitting ? 'Ingresando…' : 'Ingresar'}</span>
                {!submitting && (
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                )}
              </button>
            </form>
          </div>
        </main>
    </div>
  );
}
