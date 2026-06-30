import { Router } from 'express';
import { prisma } from './db';
import { getUserId } from './auth';
import { HttpError, ok } from './http';

export const routinesRouter = Router();
export const routineDaysRouter = Router();
export const routineDayExercisesRouter = Router();

// ─── Helpers de validación ────────────────────────────────────────────────────

function parseName(body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== 'string' || b.name.trim() === '') {
    throw new HttpError(400, 'name es requerido y debe ser texto no vacío');
  }
  return b.name.trim();
}

function parseNameOrOrder(body: unknown): { name?: string; order?: number } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: { name?: string; order?: number } = {};
  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || b.name.trim() === '') {
      throw new HttpError(400, 'name debe ser texto no vacío');
    }
    data.name = b.name.trim();
  }
  if (b.order !== undefined) {
    if (typeof b.order !== 'number' || !Number.isInteger(b.order)) {
      throw new HttpError(400, 'order debe ser un entero');
    }
    data.order = b.order;
  }
  if (data.name === undefined && data.order === undefined) {
    throw new HttpError(400, 'Hay que enviar al menos name u order');
  }
  return data;
}

// Include reutilizable para cargar rutina completa (días → ejercicios → Exercise).
// Exportado para que import.ts pueda reutilizarlo sin duplicar el shape.
export const fullInclude = {
  days: {
    orderBy: { order: 'asc' as const },
    include: {
      exercises: {
        orderBy: { order: 'asc' as const },
        include: { exercise: true },
      },
    },
  },
};

// ─── Rutinas (/routines) ──────────────────────────────────────────────────────

// GET /routines — todas las rutinas del usuario, con días y ejercicios anidados
routinesRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  const routines = await prisma.routine.findMany({
    where: { userId },
    orderBy: { order: 'asc' },
    include: fullInclude,
  });
  ok(res, routines);
});

// POST /routines — crear rutina vacía { name }
routinesRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const name = parseName(req.body);
  const routine = await prisma.routine.create({
    data: { name, userId },
    include: fullInclude,
  });
  ok(res, routine, 201);
});

// PATCH /routines/:id — renombrar o reordenar { name?, order? }
routinesRouter.patch('/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const data = parseNameOrOrder(req.body);
  const existing = await prisma.routine.findFirst({ where: { id, userId } });
  if (!existing) throw new HttpError(404, 'Rutina no encontrada');
  const routine = await prisma.routine.update({ where: { id }, data });
  ok(res, routine);
});

// DELETE /routines/:id — borra la rutina (días e ítems caen por cascade)
routinesRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const existing = await prisma.routine.findFirst({ where: { id, userId } });
  if (!existing) throw new HttpError(404, 'Rutina no encontrada');
  await prisma.routine.delete({ where: { id } });
  ok(res, { id });
});

// PATCH /routines/:id/reorder — reordena los días de la rutina en una transacción
// Valida propiedad y que dayIds coincida exactamente con los días de la rutina.
routinesRouter.patch('/:id/reorder', async (req, res) => {
  const userId = getUserId(req);
  const { id: routineId } = req.params;
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.dayIds) || b.dayIds.some((d) => typeof d !== 'string')) {
    throw new HttpError(400, 'dayIds debe ser un array de strings');
  }
  const dayIds = b.dayIds as string[];

  const routine = await prisma.routine.findFirst({
    where: { id: routineId, userId },
    include: { days: { select: { id: true } } },
  });
  if (!routine) throw new HttpError(404, 'Rutina no encontrada');

  const routineDayIds = new Set(routine.days.map((d) => d.id));
  if (dayIds.length !== routineDayIds.size || dayIds.some((id) => !routineDayIds.has(id))) {
    throw new HttpError(400, 'dayIds no coincide con los días de la rutina');
  }

  await prisma.$transaction(
    dayIds.map((id, idx) =>
      prisma.routineDay.update({ where: { id }, data: { order: idx } }),
    ),
  );
  ok(res, { count: dayIds.length });
});

// POST /routines/:id/days — agregar un día a la rutina { name }
routinesRouter.post('/:id/days', async (req, res) => {
  const userId = getUserId(req);
  const { id: routineId } = req.params;
  const name = parseName(req.body);
  const routine = await prisma.routine.findFirst({ where: { id: routineId, userId } });
  if (!routine) throw new HttpError(404, 'Rutina no encontrada');
  const day = await prisma.routineDay.create({
    data: { name, routineId },
    include: {
      exercises: { orderBy: { order: 'asc' }, include: { exercise: true } },
    },
  });
  ok(res, day, 201);
});

// ─── Días (/routine-days) ─────────────────────────────────────────────────────

// PATCH /routine-days/:dayId — renombrar o reordenar { name?, order? }
routineDaysRouter.patch('/:dayId', async (req, res) => {
  const userId = getUserId(req);
  const { dayId } = req.params;
  const data = parseNameOrOrder(req.body);
  // Verificar dueño transitivo: day → routine → userId
  const day = await prisma.routineDay.findFirst({
    where: { id: dayId, routine: { userId } },
  });
  if (!day) throw new HttpError(404, 'Día no encontrado');
  const updated = await prisma.routineDay.update({ where: { id: dayId }, data });
  ok(res, updated);
});

// PATCH /routine-days/:dayId/reorder — reordena ejercicios del día en una transacción
// Valida propiedad transitiva y que itemIds coincida exactamente con los ejercicios del día.
routineDaysRouter.patch('/:dayId/reorder', async (req, res) => {
  const userId = getUserId(req);
  const { dayId } = req.params;
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.itemIds) || b.itemIds.some((id) => typeof id !== 'string')) {
    throw new HttpError(400, 'itemIds debe ser un array de strings');
  }
  const itemIds = b.itemIds as string[];

  const day = await prisma.routineDay.findFirst({
    where: { id: dayId, routine: { userId } },
    include: { exercises: { select: { id: true } } },
  });
  if (!day) throw new HttpError(404, 'Día no encontrado');

  const dayItemIds = new Set(day.exercises.map((e) => e.id));
  if (itemIds.length !== dayItemIds.size || itemIds.some((id) => !dayItemIds.has(id))) {
    throw new HttpError(400, 'itemIds no coincide con los ejercicios del día');
  }

  await prisma.$transaction(
    itemIds.map((id, idx) =>
      prisma.routineDayExercise.update({ where: { id }, data: { order: idx } }),
    ),
  );
  ok(res, { count: itemIds.length });
});

// DELETE /routine-days/:dayId — borra el día (ítems caen por cascade)
routineDaysRouter.delete('/:dayId', async (req, res) => {
  const userId = getUserId(req);
  const { dayId } = req.params;
  const day = await prisma.routineDay.findFirst({
    where: { id: dayId, routine: { userId } },
  });
  if (!day) throw new HttpError(404, 'Día no encontrado');
  await prisma.routineDay.delete({ where: { id: dayId } });
  ok(res, { id: dayId });
});

// POST /routine-days/:dayId/exercises — agregar ejercicio al día { exerciseId }
routineDaysRouter.post('/:dayId/exercises', async (req, res) => {
  const userId = getUserId(req);
  const { dayId } = req.params;
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (typeof b.exerciseId !== 'string' || b.exerciseId.trim() === '') {
    throw new HttpError(400, 'exerciseId es requerido');
  }
  const exerciseId = b.exerciseId.trim();

  const day = await prisma.routineDay.findFirst({
    where: { id: dayId, routine: { userId } },
  });
  if (!day) throw new HttpError(404, 'Día no encontrado');

  // CRÍTICO: verificar que el ejercicio sea del usuario antes de agregarlo al día
  const exercise = await prisma.exercise.findFirst({ where: { id: exerciseId, userId } });
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado');

  const last = await prisma.routineDayExercise.findFirst({
    where: { routineDayId: dayId },
    orderBy: { order: 'desc' },
  });
  const order = (last?.order ?? -1) + 1;

  const item = await prisma.routineDayExercise.create({
    data: { routineDayId: dayId, exerciseId, order },
    include: { exercise: true },
  });
  ok(res, item, 201);
});

// ─── Ítems de ejercicio (/routine-day-exercises) ──────────────────────────────

// PATCH /routine-day-exercises/:itemId — reordenar { order }
routineDayExercisesRouter.patch('/:itemId', async (req, res) => {
  const userId = getUserId(req);
  const { itemId } = req.params;
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (typeof b.order !== 'number' || !Number.isInteger(b.order)) {
    throw new HttpError(400, 'order debe ser un entero');
  }
  // Verificar dueño transitivo: item → day → routine → userId
  const item = await prisma.routineDayExercise.findFirst({
    where: { id: itemId, day: { routine: { userId } } },
  });
  if (!item) throw new HttpError(404, 'Ítem no encontrado');
  const updated = await prisma.routineDayExercise.update({
    where: { id: itemId },
    data: { order: b.order },
    include: { exercise: true },
  });
  ok(res, updated);
});

// DELETE /routine-day-exercises/:itemId — quitar ejercicio del día
routineDayExercisesRouter.delete('/:itemId', async (req, res) => {
  const userId = getUserId(req);
  const { itemId } = req.params;
  const item = await prisma.routineDayExercise.findFirst({
    where: { id: itemId, day: { routine: { userId } } },
  });
  if (!item) throw new HttpError(404, 'Ítem no encontrado');
  await prisma.routineDayExercise.delete({ where: { id: itemId } });
  ok(res, { id: itemId });
});
