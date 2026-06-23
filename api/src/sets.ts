import { Router } from 'express';
import { prisma } from './db';
import { getUserId } from './auth';
import { HttpError, ok } from './http';

export const setsRouter = Router();

type CreateSetBody = { exerciseId: string; weight: number; reps: number; rir?: number };

// Valida el body de una serie. Tira HttpError 400 si el input externo no cierra.
function parseCreateSet(body: unknown): CreateSetBody {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.exerciseId !== 'string' || b.exerciseId.trim() === '') {
    throw new HttpError(400, 'exerciseId es requerido');
  }
  if (typeof b.weight !== 'number' || !Number.isFinite(b.weight) || b.weight < 0) {
    throw new HttpError(400, 'weight debe ser un número ≥ 0');
  }
  if (typeof b.reps !== 'number' || !Number.isInteger(b.reps) || b.reps <= 0) {
    throw new HttpError(400, 'reps debe ser un entero > 0');
  }
  if (b.rir !== undefined && b.rir !== null) {
    if (typeof b.rir !== 'number' || !Number.isInteger(b.rir) || b.rir < 0) {
      throw new HttpError(400, 'rir debe ser un entero ≥ 0');
    }
  }

  return {
    exerciseId: b.exerciseId.trim(),
    weight: b.weight,
    reps: b.reps,
    rir: typeof b.rir === 'number' ? b.rir : undefined,
  };
}

// POST /sets — registra una serie en un ejercicio TUYO { exerciseId, weight, reps, rir }
setsRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const data = parseCreateSet(req.body);
  // El ejercicio tiene que existir y ser tuyo; si no, 404 (no se filtra que existe de otro).
  const exercise = await prisma.exercise.findFirst({ where: { id: data.exerciseId, userId } });
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado');
  const set = await prisma.workoutSet.create({ data });
  ok(res, set, 201);
});
