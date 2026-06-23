import type { Response } from 'express';

// DECISIÓN: HttpError lleva su propio status para que el handler de error central
// (en server.ts) pueda armar el envelope { success: false, error } con el código correcto.
// Mantiene los handlers limpios: validan y tiran error, sin repetir res.status(...).json(...).
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

// Envelope de éxito uniforme. Todas las respuestas OK pasan por acá.
export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}
