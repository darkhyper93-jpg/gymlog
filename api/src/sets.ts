import { Router } from 'express';
import { prisma } from './db';
import { getUserId } from './auth';
import { HttpError, ok } from './http';
import { computeStats, unlockNewAchievements } from './achievements';
import { dayBoundsMVD } from './time';
import { est1RM } from './analysis';

export const setsRouter = Router();

type CreateSetBody = { exerciseId: string; weight: number; reps: number; rir?: number; date?: Date; note?: string };
type UpdateSetBody = { weight?: number; reps?: number; rir?: number | null; note?: string | null };

// Recalcula el estado de logros tras editar o borrar una serie (récords/volumen/días/racha).
// DECISIÓN: includeNewPR = false y unlockNewAchievements solo inserta (nunca borra), así no se
// revoca ningún logro ya ganado; computeStats conserva 'first-pr' leyéndolo de DB. No se intenta
// detectar un nuevo PR en una edición: un PR es un evento histórico del momento de la carga y
// recomputarlo desde cero es ambiguo y desproporcionado para esta app.
async function recomputeAchievements(userId: string): Promise<void> {
  const stats = await computeStats(userId, false);
  await unlockNewAchievements(userId, stats);
}

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

  const result: CreateSetBody = {
    exerciseId: b.exerciseId.trim(),
    weight: b.weight,
    reps: b.reps,
    rir: typeof b.rir === 'number' ? b.rir : undefined,
  };

  if (b.date !== undefined) {
    if (typeof b.date !== 'string') throw new HttpError(400, 'date debe ser una fecha ISO');
    const d = new Date(b.date);
    if (isNaN(d.getTime())) throw new HttpError(400, 'date inválida');
    if (d > new Date()) throw new HttpError(400, 'No podés registrar series en el futuro');
    result.date = d;
  }

  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== 'string') throw new HttpError(400, 'note debe ser texto');
    const trimmed = b.note.trim();
    if (trimmed.length > 500) throw new HttpError(400, 'note no puede superar 500 caracteres');
    result.note = trimmed || undefined;
  }

  return result;
}

function parseUpdateSet(body: unknown): UpdateSetBody {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: UpdateSetBody = {};

  if (b.weight !== undefined) {
    if (typeof b.weight !== 'number' || !Number.isFinite(b.weight) || b.weight < 0) {
      throw new HttpError(400, 'weight debe ser un número ≥ 0');
    }
    data.weight = b.weight;
  }
  if (b.reps !== undefined) {
    if (typeof b.reps !== 'number' || !Number.isInteger(b.reps) || b.reps <= 0) {
      throw new HttpError(400, 'reps debe ser un entero > 0');
    }
    data.reps = b.reps;
  }
  if (b.rir !== undefined) {
    if (b.rir === null) {
      data.rir = null;
    } else if (typeof b.rir !== 'number' || !Number.isInteger(b.rir) || b.rir < 0) {
      throw new HttpError(400, 'rir debe ser un entero ≥ 0');
    } else {
      data.rir = b.rir;
    }
  }
  if (b.note !== undefined) {
    if (b.note === null) {
      data.note = null;
    } else if (typeof b.note !== 'string') {
      throw new HttpError(400, 'note debe ser texto');
    } else {
      data.note = b.note.trim() || null;
    }
  }

  if (data.weight === undefined && data.reps === undefined && b.rir === undefined && b.note === undefined) {
    throw new HttpError(400, 'Hay que enviar al menos un campo a editar (weight, reps, rir o note)');
  }
  return data;
}

// GET /sets/today — series del usuario de hoy (hora Uruguay) agrupadas implícitamente.
// El frontend las agrupa por exerciseId para el "planeado vs real" en rutinas.
setsRouter.get('/today', async (req, res) => {
  const userId = getUserId(req);
  const { start, end } = dayBoundsMVD(new Date());
  const sets = await prisma.workoutSet.findMany({
    where: { exercise: { userId }, date: { gte: start, lt: end } },
    orderBy: [{ order: 'asc' }, { date: 'asc' }],
  });
  ok(res, sets);
});

// POST /sets — registra una serie y detecta PRs de peso y 1RM estimado.
// Responde { set, prs: { weightPR, oneRmPR }, achievements: [] } (achievements lo llena Etapa 5).
setsRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const data = parseCreateSet(req.body);

  const exercise = await prisma.exercise.findFirst({ where: { id: data.exerciseId, userId } });
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado');

  // Récords anteriores — calcular ANTES de insertar la nueva serie.
  const prevSets = await prisma.workoutSet.findMany({ where: { exerciseId: data.exerciseId } });
  const prevMaxWeight = prevSets.length > 0 ? Math.max(...prevSets.map((s) => s.weight)) : null;
  const prevBest1RM =
    prevSets.length > 0 ? Math.max(...prevSets.map((s) => est1RM(s.weight, s.reps))) : null;

  // order = max order de las series de HOY para este ejercicio + 1 (0 si no hay).
  const { start: todayStart, end: todayEnd } = dayBoundsMVD(data.date ? new Date(data.date) : new Date());
  const lastToday = await prisma.workoutSet.findFirst({
    where: { exerciseId: data.exerciseId, date: { gte: todayStart, lt: todayEnd } },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  const order = (lastToday?.order ?? -1) + 1;

  const set = await prisma.workoutSet.create({ data: { ...data, order } });

  const weightPR = prevMaxWeight === null || set.weight > prevMaxWeight;
  const oneRmPR = prevBest1RM === null || est1RM(set.weight, set.reps) > prevBest1RM;
  const hasPR = weightPR || oneRmPR;

  // Calcular stats y desbloquear logros nuevos tras insertar la serie.
  const stats = await computeStats(userId, hasPR);
  const achievements = await unlockNewAchievements(userId, stats);

  ok(res, { set, prs: { weightPR, oneRmPR }, achievements }, 201);
});

// PATCH /sets/reorder — reordena series del usuario en una transacción.
// Valida ownership transitivo de cada serie: set → exercise → userId.
setsRouter.patch('/reorder', async (req, res) => {
  const userId = getUserId(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.setIds) || b.setIds.some((id) => typeof id !== 'string')) {
    throw new HttpError(400, 'setIds debe ser un array de strings');
  }
  const setIds = b.setIds as string[];
  if (setIds.length === 0) throw new HttpError(400, 'setIds no puede estar vacío');

  // Verificar que todas las series pertenecen al usuario (ownership transitivo).
  const owned = await prisma.workoutSet.findMany({
    where: { id: { in: setIds }, exercise: { userId } },
    select: { id: true },
  });
  if (owned.length !== setIds.length) {
    throw new HttpError(403, 'Una o más series no pertenecen al usuario');
  }

  await prisma.$transaction(
    setIds.map((id, idx) =>
      prisma.workoutSet.update({ where: { id }, data: { order: idx } }),
    ),
  );
  ok(res, { count: setIds.length });
});

// DELETE /sets/:id — borra una serie del usuario.
// Chequeo transitivo: la serie pertenece al usuario vía set → exercise → userId.
// DECISIÓN: borrar una serie no revoca logros ya ganados (más simple y amable).
setsRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const existing = await prisma.workoutSet.findFirst({
    where: { id, exercise: { userId } },
  });
  if (!existing) throw new HttpError(404, 'Serie no encontrada');
  await prisma.workoutSet.delete({ where: { id } });
  await recomputeAchievements(userId);
  ok(res, { id });
});

// PATCH /sets/:id — edita weight, reps o rir de una serie del usuario.
// Mismo chequeo transitivo que DELETE.
setsRouter.patch('/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const data = parseUpdateSet(req.body);
  const existing = await prisma.workoutSet.findFirst({
    where: { id, exercise: { userId } },
  });
  if (!existing) throw new HttpError(404, 'Serie no encontrada');
  const updated = await prisma.workoutSet.update({ where: { id }, data });
  await recomputeAchievements(userId);
  ok(res, updated);
});
