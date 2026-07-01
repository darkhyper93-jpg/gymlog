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

type RoutinePatchBody = { name?: string; order?: number; autoDeloadEnabled?: boolean };

function parseNameOrOrder(body: unknown): RoutinePatchBody {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: RoutinePatchBody = {};
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
  if (b.autoDeloadEnabled !== undefined) {
    if (typeof b.autoDeloadEnabled !== 'boolean') {
      throw new HttpError(400, 'autoDeloadEnabled debe ser booleano');
    }
    data.autoDeloadEnabled = b.autoDeloadEnabled;
  }
  if (data.name === undefined && data.order === undefined && data.autoDeloadEnabled === undefined) {
    throw new HttpError(400, 'Hay que enviar al menos name, order o autoDeloadEnabled');
  }
  return data;
}

// Guard de activación (autorregulación, decisión #2 de Santi): cuenta los ejercicios
// DISTINTOS de la rutina (los de sus días) que no tengan ninguna serie con peso registrado.
// Si hay ≥1, rechaza con 400 listando cuáles. Desactivar nunca pasa por acá.
async function assertRoutineEligibleForAutoDeload(routineId: string): Promise<void> {
  const routine = await prisma.routine.findUnique({
    where: { id: routineId },
    include: { days: { include: { exercises: { include: { exercise: true } } } } },
  });
  if (!routine) throw new HttpError(404, 'Rutina no encontrada');

  const exercisesById = new Map<string, { id: string; name: string }>();
  for (const day of routine.days) {
    for (const item of day.exercises) {
      exercisesById.set(item.exerciseId, { id: item.exerciseId, name: item.exercise.name });
    }
  }
  if (exercisesById.size === 0) {
    throw new HttpError(400, 'La rutina no tiene ejercicios todavía; agregá al menos uno con series registradas.');
  }

  // weight: { gt: 0 } — una serie con peso 0 (ej. peso corporal) no cuenta: el motor la
  // filtra como outlier (analysis.ts summarizeSessions) y no generaría ninguna sugerencia.
  const withWeight = await prisma.workoutSet.findMany({
    where: { exerciseId: { in: [...exercisesById.keys()] }, weight: { gt: 0 } },
    select: { exerciseId: true },
    distinct: ['exerciseId'],
  });
  const withWeightIds = new Set(withWeight.map((s) => s.exerciseId));

  const missing = [...exercisesById.values()].filter((ex) => !withWeightIds.has(ex.id));
  if (missing.length > 0) {
    throw new HttpError(
      400,
      `Para activar las sugerencias, cargá al menos una serie con peso en: ${missing.map((e) => e.name).join(', ')}`,
    );
  }
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

// PATCH /routines/:id — renombrar, reordenar o { autoDeloadEnabled } (activar exige el guard)
routinesRouter.patch('/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const data = parseNameOrOrder(req.body);
  const existing = await prisma.routine.findFirst({ where: { id, userId } });
  if (!existing) throw new HttpError(404, 'Rutina no encontrada');

  // Activar (false → true) exige el guard; desactivar nunca se bloquea.
  if (data.autoDeloadEnabled === true && !existing.autoDeloadEnabled) {
    await assertRoutineEligibleForAutoDeload(id);
  }

  const routine = await prisma.routine.update({ where: { id }, data, include: fullInclude });
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

type ItemPatchBody = {
  order?: number;
  plannedSets?: number | null;
  plannedReps?: string | null;
  plannedRir?: string | null;
  restSeconds?: number | null;
  note?: string | null;
};

// Valida el body del PATCH de ítem: order (reorder) y/o el plan del ítem. Todos opcionales,
// pero exige al menos uno presente. null limpia un campo de plan.
function parseItemPatchBody(body: unknown): ItemPatchBody {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: ItemPatchBody = {};
  let any = false;

  if (b.order !== undefined) {
    if (typeof b.order !== 'number' || !Number.isInteger(b.order)) {
      throw new HttpError(400, 'order debe ser un entero');
    }
    data.order = b.order;
    any = true;
  }
  if (b.plannedSets !== undefined) {
    any = true;
    if (b.plannedSets === null) {
      data.plannedSets = null;
    } else if (
      typeof b.plannedSets !== 'number' ||
      !Number.isInteger(b.plannedSets) ||
      b.plannedSets < 1 ||
      b.plannedSets > 30
    ) {
      throw new HttpError(400, 'plannedSets debe ser un entero entre 1 y 30, o null');
    } else {
      data.plannedSets = b.plannedSets;
    }
  }
  if (b.plannedReps !== undefined) {
    any = true;
    if (b.plannedReps === null) {
      data.plannedReps = null;
    } else if (typeof b.plannedReps !== 'string' || b.plannedReps.trim() === '') {
      throw new HttpError(400, 'plannedReps debe ser texto no vacío, o null');
    } else {
      data.plannedReps = b.plannedReps.trim();
    }
  }
  if (b.plannedRir !== undefined) {
    any = true;
    if (b.plannedRir === null) {
      data.plannedRir = null;
    } else if (typeof b.plannedRir !== 'string' || b.plannedRir.trim() === '') {
      throw new HttpError(400, 'plannedRir debe ser texto no vacío, o null');
    } else {
      data.plannedRir = b.plannedRir.trim();
    }
  }
  if (b.restSeconds !== undefined) {
    any = true;
    if (b.restSeconds === null) {
      data.restSeconds = null;
    } else if (
      typeof b.restSeconds !== 'number' ||
      !Number.isInteger(b.restSeconds) ||
      b.restSeconds < 0 ||
      b.restSeconds > 3600
    ) {
      throw new HttpError(400, 'restSeconds debe ser un entero entre 0 y 3600, o null');
    } else {
      data.restSeconds = b.restSeconds;
    }
  }
  if (b.note !== undefined) {
    any = true;
    if (b.note === null) {
      data.note = null;
    } else if (typeof b.note !== 'string') {
      throw new HttpError(400, 'note debe ser texto, o null');
    } else {
      data.note = b.note.trim() === '' ? null : b.note.trim();
    }
  }

  if (!any) {
    throw new HttpError(400, 'Hay que enviar al menos un campo (order, plannedSets, plannedReps, plannedRir, restSeconds o note)');
  }
  return data;
}

// PATCH /routine-day-exercises/:itemId — reordenar { order } y/o editar el plan del ítem
// { plannedSets, plannedReps, plannedRir, restSeconds, note }
routineDayExercisesRouter.patch('/:itemId', async (req, res) => {
  const userId = getUserId(req);
  const { itemId } = req.params;
  const data = parseItemPatchBody(req.body);
  // Verificar dueño transitivo: item → day → routine → userId
  const item = await prisma.routineDayExercise.findFirst({
    where: { id: itemId, day: { routine: { userId } } },
  });
  if (!item) throw new HttpError(404, 'Ítem no encontrado');
  const updated = await prisma.routineDayExercise.update({
    where: { id: itemId },
    data,
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
