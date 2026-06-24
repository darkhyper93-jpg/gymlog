import { Router } from 'express';
import { prisma } from './db';
import { getUserId } from './auth';
import { HttpError, ok } from './http';
import { computeStats, unlockNewAchievements } from './achievements';

export const setsRouter = Router();

type CreateSetBody = { exerciseId: string; weight: number; reps: number; rir?: number };

// DECISIÓN: Epley — la fórmula de 1RM más difundida, sin tablas de lookup.
// Se usa tanto para detectar PRs al crear una serie como para calcular progreso en el frontend.
function est1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
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

  return {
    exerciseId: b.exerciseId.trim(),
    weight: b.weight,
    reps: b.reps,
    rir: typeof b.rir === 'number' ? b.rir : undefined,
  };
}

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

  const set = await prisma.workoutSet.create({ data });

  const weightPR = prevMaxWeight === null || set.weight > prevMaxWeight;
  const oneRmPR = prevBest1RM === null || est1RM(set.weight, set.reps) > prevBest1RM;
  const hasPR = weightPR || oneRmPR;

  // Calcular stats y desbloquear logros nuevos tras insertar la serie.
  const stats = await computeStats(userId, hasPR);
  const achievements = await unlockNewAchievements(userId, stats);

  ok(res, { set, prs: { weightPR, oneRmPR }, achievements }, 201);
});
