import { useCallback, useEffect, useState } from 'react';
import { login as loginApi, register as registerApi } from '../api/auth';
import { clearToken, getToken, setToken, subscribeToken } from '../auth/token';

// Hook de sesión: expone si hay token y las acciones login/register/logout. Escucha cambios
// del token (incluido el limpiado por un 401) para reaccionar sin recargar la página.
export function useAuth() {
  const [token, setTok] = useState<string | null>(getToken());

  useEffect(() => subscribeToken(setTok), []);

  const login = useCallback(async (username: string, password: string) => {
    const { token } = await loginApi(username, password);
    setToken(token);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const { token } = await registerApi(username, password);
    setToken(token);
  }, []);

  const logout = useCallback(() => {
    clearToken();
  }, []);

  return { isAuthed: token !== null, login, register, logout };
}
