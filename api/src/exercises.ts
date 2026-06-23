import { Router } from 'express';
import { prisma } from './db';
import { getUserId } from './auth';
import { HttpError, ok } from './http';

export const exercisesRouter = Router();

// Grupos musculares permitidos (lista fija). Claves sin acento para guardar prolijo;
// el label lindo lo arma el frontend. Si crece, mover a una tabla.
const MUSCLE_GROUPS = [
  'espalda',
  'hombro',
  'pecho',
  'piernas',
  'triceps',
  'biceps',
  'trapecio',
] as const;
type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

function isMuscleGroup(value: unknown): value is MuscleGroup {
  return typeof value === 'string' && (MUSCLE_GROUPS as readonly string[]).includes(value);
}

type CreateExerciseBody = { name: string; target?: string; muscleGroup: MuscleGroup };
type UpdateExerciseBody = { name?: string; target?: string; muscleGroup?: MuscleGroup };

// Valida el body de creación. Tira HttpError 400 si el input externo no cierra.
function parseCreateBody(body: unknown): CreateExerciseBody {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== 'string' || b.name.trim() === '') {
    throw new HttpError(400, 'name es requerido y debe ser texto no vacío');
  }
  if (b.target !== undefined && b.target !== null && typeof b.target !== 'string') {
    throw new HttpError(400, 'target debe ser texto');
  }
  if (!isMuscleGroup(b.muscleGroup)) {
    throw new HttpError(400, `muscleGroup es requerido y debe ser uno de: ${MUSCLE_GROUPS.join(', ')}`);
  }
  return {
    name: b.name.trim(),
    target: typeof b.target === 'string' && b.target.trim() !== '' ? b.target.trim() : undefined,
    muscleGroup: b.muscleGroup,
  };
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
    // target vacío o null limpia el objetivo
    data.target = typeof b.target === 'string' && b.target.trim() !== '' ? b.target.trim() : undefined;
  }
  if (b.muscleGroup !== undefined) {
    if (!isMuscleGroup(b.muscleGroup)) {
      throw new HttpError(400, `muscleGroup debe ser uno de: ${MUSCLE_GROUPS.join(', ')}`);
    }
    data.muscleGroup = b.muscleGroup;
  }
  if (
    data.name === undefined &&
    data.target === undefined &&
    b.target === undefined &&
    data.muscleGroup === undefined
  ) {
    throw new HttpError(400, 'Hay que enviar al menos un campo a editar (name, target o muscleGroup)');
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
  const exercise = await prisma.exercise.create({ data: { ...data, userId } });
  ok(res, exercise, 201);
});

// PATCH /exercises/:id — edita un ejercicio TUYO (404 si no existe o no es tuyo)
exercisesRouter.patch('/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const data = parseUpdateBody(req.body);
  const existing = await prisma.exercise.findFirst({ where: { id, userId } });
  if (!existing) throw new HttpError(404, 'Ejercicio no encontrado');
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

  // DECISIÓN: una "sesión" son todas las series del mismo día calendario que la última
  // serie registrada. Para una app personal de una sola zona horaria, usar los límites del
  // día local alcanza y es simple.
  const dayStart = new Date(latest.date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

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
