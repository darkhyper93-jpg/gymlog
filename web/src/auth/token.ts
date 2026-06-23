// Token JWT del login: se guarda en localStorage para que la sesión sobreviva al refresh.
// Un mini pub/sub avisa a quien escuche cuando cambia (login, logout o un 401 que lo limpia),
// así la app vuelve al login sin recargar la página.

const KEY = 'gymlog_token';

let current: string | null = localStorage.getItem(KEY);
const listeners = new Set<(token: string | null) => void>();

export function getToken(): string | null {
  return current;
}

export function setToken(token: string | null): void {
  current = token;
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l(current));
}

export function clearToken(): void {
  setToken(null);
}

export function subscribeToken(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
