import 'dotenv/config'; // carga api/.env → process.env (JWT_SECRET, etc.) antes que nada
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { exercisesRouter } from './exercises';
import { setsRouter } from './sets';
import { authRouter, requireAuth } from './auth';
import { routinesRouter, routineDaysRouter, routineDayExercisesRouter } from './routines';
import { achievementsRouter } from './achievements';
import { exportRouter } from './export';
import { bodyWeightRouter } from './body-weight';
import { HttpError } from './http';

const app = express();
// CORS: en dev (sin CORS_ORIGIN) se permite cualquier origen; en producción se limita a los
// dominios del frontend (CORS_ORIGIN puede ser uno o varios separados por coma).
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors(corsOrigin ? { origin: corsOrigin.split(',').map((o) => o.trim()) } : undefined),
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ success: true, data: 'ok' });
});

// Rate limiting en las rutas de auth para frenar fuerza bruta.
// Con 3 usuarios el riesgo es bajo, pero la API está expuesta a internet.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// Rutas públicas de login.
app.use('/auth', authLimiter, authRouter);

// Rutas de datos protegidas: exigen Authorization: Bearer <token> (requireAuth).
app.use('/exercises', requireAuth, exercisesRouter);
app.use('/sets', requireAuth, setsRouter);
app.use('/routines', requireAuth, routinesRouter);
app.use('/routine-days', requireAuth, routineDaysRouter);
app.use('/routine-day-exercises', requireAuth, routineDayExercisesRouter);
app.use('/achievements', requireAuth, achievementsRouter);
app.use('/export', requireAuth, exportRouter);
app.use('/body-weight', requireAuth, bodyWeightRouter);

// Handler de error central: arma el envelope { success: false, error } con el status correcto.
// Express 5 propaga el rechazo de las promesas async hasta acá, así que los handlers solo
// tienen que tirar HttpError (o cualquier error) y este middleware responde.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof HttpError ? err.message : 'Error interno del servidor';
  res.status(status).json({ success: false, error: message });
});

// DECISIÓN: el puerto se lee de env (PORT) con default 4000. En local queda en 4000;
// en producción (Render) la plataforma inyecta PORT.
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  // Log de arranque del server (lifecycle, no debug).
  console.log(`API corriendo en http://localhost:${port}`);
});
