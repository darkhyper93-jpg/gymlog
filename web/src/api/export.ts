import { getToken } from '../auth/token';
import { ApiError } from './client';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// Descarga el CSV de todas las series del usuario disparando un click en un anchor temporal.
export async function downloadExportCsv(): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/export`, { headers });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor');
  }

  if (!res.ok) {
    throw new ApiError(res.status, 'Error al exportar los datos');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  a.href = url;
  a.download = match ? match[1] : 'gymlog-export.csv';
  a.click();
  URL.revokeObjectURL(url);
}
