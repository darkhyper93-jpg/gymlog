// Cliente HTTP central: arma la URL, manda JSON y DESEMPAQUETA el envelope { success, data }.
// Si la respuesta es { success: false, error }, tira un Error con ese mensaje para que la UI
// lo muestre en su estado de error.

import { clearToken, getToken } from '../auth/token';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// El backend siempre responde con uno de estos dos shapes.
type Envelope<T> = { success: true; data: T } | { success: false; error: string };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  // Headers: JSON si hay body + el token de sesión si existe (rutas protegidas).
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Falla de red / server caído: mensaje claro para el estado de error de la UI.
    throw new ApiError(0, 'No se pudo conectar con el servidor');
  }

  // Token vencido/ inválido en una ruta protegida: limpiar la sesión → la app vuelve al login.
  if (res.status === 401 && token) clearToken();

  let payload: Envelope<T>;
  try {
    payload = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(res.status, 'Respuesta inválida del servidor');
  }

  if (!payload.success) {
    throw new ApiError(res.status, payload.error);
  }
  return payload.data;
}
