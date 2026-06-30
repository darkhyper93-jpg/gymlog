import { Router } from 'express';
import { prisma } from './db';
import { getUserId } from './auth';
import { HttpError, ok } from './http';
import { dayBoundsMVD } from './time';
import { getAllowedMuscleGroups, normalizeMg } from './muscle-groups';

export const exercisesRouter = Router();

type CreateExerciseBody = { name: string; target?: string; muscleGroup: string; restSeconds?: number };
type UpdateExerciseBody = { name?: string; target?: string | null; muscleGroup?: string; restSeconds?: number | null };

// Valida que el muscleGroup pedido esté en el conjunto permitido (built-in ∪ custom del
// usuario), comparando case-insensitive, y devuelve el valor canónico guardado (la key
// built-in tal cual o el name custom tal cual existe en DB) para no persistir variantes
// de capitalización.
async function resolveMuscleGroup(userId: string, value: string): Promise<string> {
  const allowed = await getAllowedMuscleGroups(userId);
  const normalized = normalizeMg(value);
  for (const candidate of allowed) {
    if (normalizeMg(candidate) === normalized) return candidate;
  }
  throw new HttpError(400, 'muscleGroup inválido');
}

// Valida el body de creación. Tira HttpError 400 si el input externo no cierra.
// El muscleGroup se valida contra built-in ∪ custom en el handler (necesita el userId).
function parseCreateBody(body: unknown): CreateExerciseBody {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== 'string' || b.name.trim() === '') {
    throw new HttpError(400, 'name es requerido y debe ser texto no vacío');
  }
  if (b.target !== undefined && b.target !== null && typeof b.target !== 'string') {
    throw new HttpError(400, 'target debe ser texto');
  }
  if (typeof b.muscleGroup !== 'string' || b.muscleGroup.trim() === '') {
    throw new HttpError(400, 'muscleGroup es requerido y debe ser texto');
  }
  const result: CreateExerciseBody = {
    name: b.name.trim(),
    target: typeof b.target === 'string' && b.target.trim() !== '' ? b.target.trim() : undefined,
    muscleGroup: b.muscleGroup,
  };
  if (b.restSeconds !== undefined && b.restSeconds !== null) {
    if (typeof b.restSeconds !== 'number' || !Number.isInteger(b.restSeconds) || b.restSeconds < 0) {
      throw new HttpError(400, 'restSeconds debe ser un entero ≥ 0');
    }
    result.restSeconds = b.restSeconds;
  }
  return result;
}

// Valida el body de edición: al menos un campo, y los tipos correctos.
function parseUpdateBody(body: unknown): UpdateExerciseBody {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: UpdateExerciseBody = {};
  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || b.name.trim() === '') {
      throw new HttpError(400, 'name debe ser texto no vacío');
    }
    data.name = b.name.trim();
  }
  if (b.target !== undefined) {
    if (b.target !== null && typeof b.target !== 'string') {
      throw new HttpError(400, 'target debe ser texto');
    }
    // target vacío o null limpia el objetivo: usamos null (no undefined), porque Prisma
    // interpreta undefined como "no tocar el campo" y el objetivo viejo quedaría pegado.
    data.target = typeof b.target === 'string' && b.target.trim() !== '' ? b.target.trim() : null;
  }
  if (b.muscleGroup !== undefined) {
    if (typeof b.muscleGroup !== 'string' || b.muscleGroup.trim() === '') {
      throw new HttpError(400, 'muscleGroup debe ser texto no vacío');
    }
    data.muscleGroup = b.muscleGroup;
  }
  if (b.restSeconds !== undefined) {
    if (b.restSeconds === null) {
      data.restSeconds = null;
    } else if (typeof b.restSeconds !== 'number' || !Number.isInteger(b.restSeconds) || b.restSeconds < 0) {
      throw new HttpError(400, 'restSeconds debe ser un entero ≥ 0');
    } else {
      data.restSeconds = b.restSeconds;
    }
  }
  if (
    data.name === undefined &&
    data.target === undefined &&
    b.target === undefined &&
    data.muscleGroup === undefined &&
    b.restSeconds === undefined
  ) {
    throw new HttpError(400, 'Hay que enviar al menos un campo a editar (name, target, muscleGroup o restSeconds)');
  }
  return data;
}

// GET /exercises — lista SOLO tus ejercicios, el más nuevo primero
exercisesRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  const exercises = await prisma.exercise.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  ok(res, exercises);
});

// POST /exercises — crea un ejercicio tuyo (atado a tu usuario)
exercisesRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const data = parseCreateBody(req.body);
  const muscleGroup = await resolveMuscleGroup(userId, data.muscleGroup);
  const exercise = await prisma.exercise.create({ data: { ...data, muscleGroup, userId } });
  ok(res, exercise, 201);
});

// PATCH /exercises/:id — edita un ejercicio TUYO (404 si no existe o no es tuyo)
exercisesRouter.patch('/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const data = parseUpdateBody(req.body);
  const existing = await prisma.exercise.findFirst({ where: { id, userId } });
  if (!existing) throw new HttpError(404, 'Ejercicio no encontrado');
  if (data.muscleGroup !== undefined) {
    data.muscleGroup = await resolveMuscleGroup(userId, data.muscleGroup);
  }
  const exercise = await prisma.exercise.update({ where: { id }, data });
  ok(res, exercise);
});

// DELETE /exercises/:id — borra un ejercicio TUYO (sus series caen por onDelete: Cascade)
exercisesRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const existing = await prisma.exercise.findFirst({ where: { id, userId } });
  if (!existing) throw new HttpError(404, 'Ejercicio no encontrado');
  await prisma.exercise.delete({ where: { id } });
  ok(res, { id });
});

// GET /exercises/:id/last — la última sesión de un ejercicio (para saber qué superar).
// data: null si nunca se registró nada (no es error, es estado vacío).
exercisesRouter.get('/:id/last', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const exercise = await prisma.exercise.findFirst({ where: { id, userId } });
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado');

  const latest = await prisma.workoutSet.findFirst({
    where: { exerciseId: id },
    orderBy: { date: 'desc' },
  });
  if (!latest) {
    ok(res, null);
    return;
  }

  // DECISIÓN: una "sesión" son todas las series del mismo día calendario (hora Uruguay)
  // que la última serie registrada. dayBoundsMVD devuelve los límites UTC correctos.
  const { start: dayStart, end: dayEnd } = dayBoundsMVD(latest.date);

  const sets = await prisma.workoutSet.findMany({
    where: { exerciseId: id, date: { gte: dayStart, lt: dayEnd } },
    orderBy: { date: 'asc' },
  });
  ok(res, { date: dayStart, sets });
});

// GET /exercises/:id/sets — historial completo de series del ejercicio (más nuevo primero)
exercisesRouter.get('/:id/sets', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const exercise = await prisma.exercise.findFirst({ where: { id, userId } });
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado');
  const sets = await prisma.workoutSet.findMany({
    where: { exerciseId: id },
    orderBy: { date: 'desc' },
  });
  ok(res, sets);
});
