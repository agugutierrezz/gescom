import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { loginRequest, meRequest } from '../api/auth';
import { getToken, setToken, clearToken } from '../api/client';

const AuthContext = createContext(null);

const USER_KEY = 'gescom_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(Boolean(getToken()));

  // Revalida la sesión contra el backend al montar la app
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    meRequest()
      .then((me) => setUser(me))
      .catch((err) => {
        if (err.status === 401) {
          clearToken();
          setUser(null);
        }
        // Si el backend no está disponible (status 0) o el endpoint
        // todavía no existe (404), se mantiene la sesión local.
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (nombre, password, remember) => {
    const data = await loginRequest(nombre, password);
    setToken(data.access_token, remember);
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
