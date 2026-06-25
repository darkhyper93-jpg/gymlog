import { Router } from 'express';
import { prisma } from './db';
import { requireAuth, getUserId } from './auth';
import { ok } from './http';
import { localDayKeyMVD, todayKeyMVD, prevDayKey } from './time';

// ─── Definiciones estáticas ───────────────────────────────────────────────────

export type AchievementDef = {
  key: string;
  title: string;
  description: string;
  icon: string; // nombre del icono (interpretado por el frontend)
};

// DECISIÓN: logros definidos en código, no en DB, para simplificar la arquitectura.
// El dueño puede editarlos acá directamente. El icono es un string que el
// frontend mapea a su SVG correspondiente.
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: 'first-workout',
    title: 'Primera serie',
    description: 'Registraste tu primera serie. ¡El primer paso es el más difícil!',
    icon: 'dumbbell',
  },
  {
    key: 'workouts-10',
    title: '10 días entrenados',
    description: 'Entrenaste 10 días distintos. La consistencia es la clave.',
    icon: 'calendar',
  },
  {
    key: 'workouts-30',
    title: '30 días entrenados',
    description: 'Un mes de entrenamiento. Eso es un hábito real.',
    icon: 'calendar',
  },
  {
    key: 'workouts-100',
    title: '100 días entrenados',
    description: '100 días de sudor y dedicación. Leyenda.',
    icon: 'trophy',
  },
  {
    key: 'streak-3',
    title: 'Racha de 3 días',
    description: 'Entrenaste 3 días seguidos. El momentum está de tu lado.',
    icon: 'trending-up',
  },
  {
    key: 'streak-7',
    title: 'Racha de 7 días',
    description: 'Una semana entera sin fallar. Eso es disciplina.',
    icon: 'trending-up',
  },
  {
    key: 'volume-10k',
    title: '10 000 kg levantados',
    description: 'Sumaste 10 toneladas en volumen total. ¡Bestia!',
    icon: 'dumbbell',
  },
  {
    key: 'volume-100k',
    title: '100 000 kg levantados',
    description: '100 toneladas. El hierro te conoce de memoria.',
    icon: 'trophy',
  },
  {
    key: 'volume-500k',
    title: '500 000 kg levantados',
    description: 'Medio millón de kg. Eso ya es historia.',
    icon: 'trophy',
  },
  {
    key: 'first-pr',
    title: 'Primer récord',
    description: 'Superaste tu propio récord por primera vez. Siempre se puede más.',
    icon: 'trophy',
  },
];

export type AchievementStats = {
  totalSets: number;
  trainingDays: number;
  currentStreak: number;
  totalVolume: number;
  hasPR: boolean;
};

// Devuelve las claves de ACHIEVEMENTS cuyas condiciones se cumplen con las stats dadas.
export function evaluate(stats: AchievementStats): string[] {
  const earned: string[] = [];
  if (stats.totalSets >= 1) earned.push('first-workout');
  if (stats.trainingDays >= 10) earned.push('workouts-10');
  if (stats.trainingDays >= 30) earned.push('workouts-30');
  if (stats.trainingDays >= 100) earned.push('workouts-100');
  if (stats.currentStreak >= 3) earned.push('streak-3');
  if (stats.currentStreak >= 7) earned.push('streak-7');
  if (stats.totalVolume >= 10_000) earned.push('volume-10k');
  if (stats.totalVolume >= 100_000) earned.push('volume-100k');
  if (stats.totalVolume >= 500_000) earned.push('volume-500k');
  if (stats.hasPR) earned.push('first-pr');
  return earned;
}

// Calcula las stats de un usuario desde todas sus series (ya filtradas por userId).
// La fecha local del server determina el "día" (mismo criterio que el frontend: horario local).
export async function computeStats(userId: string, includeNewPR: boolean): Promise<AchievementStats> {
  const sets = await prisma.workoutSet.findMany({
    where: { exercise: { userId } },
    select: { weight: true, reps: true, date: true },
    orderBy: { date: 'asc' },
  });

  const totalSets = sets.length;
  const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);

  // Días distintos en hora de Uruguay (no en UTC del servidor)
  const dayKeys = new Set(sets.map((s) => localDayKeyMVD(s.date)));
  const trainingDays = dayKeys.size;

  // Racha actual: días consecutivos contando hacia atrás desde hoy
  const currentStreak = computeStreak(dayKeys);

  // ¿Ya tenía algún PR registrado? (la primera vez que se pasa hasPR=true es 'first-pr')
  const prCount = await prisma.userAchievement.count({
    where: { userId, key: 'first-pr' },
  });

  return {
    totalSets,
    trainingDays,
    currentStreak,
    totalVolume,
    hasPR: includeNewPR || prCount > 0,
  };
}

export function computeStreak(dayKeys: Set<string>): number {
  if (dayKeys.size === 0) return 0;
  const today = todayKeyMVD();
  // Si hoy no se entrenó aún la racha no se rompe: empezamos desde ayer.
  let cursorKey = dayKeys.has(today) ? today : prevDayKey(today);
  let streak = 0;
  while (dayKeys.has(cursorKey)) {
    streak++;
    cursorKey = prevDayKey(cursorKey);
  }
  return streak;
}

// ─── Desbloquear logros nuevos ────────────────────────────────────────────────

// Evalúa qué logros se acaban de ganar (no estaban en DB), los inserta y los devuelve con su def.
export async function unlockNewAchievements(
  userId: string,
  stats: AchievementStats,
): Promise<AchievementDef[]> {
  const earned = evaluate(stats);
  if (earned.length === 0) return [];

  // Ya desbloqueados
  const existing = await prisma.userAchievement.findMany({
    where: { userId, key: { in: earned } },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((a) => a.key));
  const newKeys = earned.filter((k) => !existingKeys.has(k));
  if (newKeys.length === 0) return [];

  // Insertar con createMany; el @@unique evita duplicados incluso ante race conditions.
  await prisma.userAchievement.createMany({
    data: newKeys.map((key) => ({ userId, key })),
    skipDuplicates: true,
  });

  return ACHIEVEMENTS.filter((a) => newKeys.includes(a.key));
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const achievementsRouter = Router();

// GET /achievements — todas las defs + estado desbloqueado del usuario
achievementsRouter.get('/', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const unlocked = await prisma.userAchievement.findMany({
    where: { userId },
    select: { key: true, unlockedAt: true },
  });
  const unlockedMap = new Map(unlocked.map((a) => [a.key, a.unlockedAt]));

  const data = ACHIEVEMENTS.map((def) => {
    const unlockedAt = unlockedMap.get(def.key);
    return {
      ...def,
      unlocked: unlockedAt != null,
      unlockedAt: unlockedAt?.toISOString() ?? null,
    };
  });

  ok(res, data);
});
