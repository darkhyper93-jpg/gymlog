// Motor de autorregulación: predicción de carga por ejercicio (doble progresión + RIR)
// y detección de meseta para sugerir una semana de descarga. La primera mitad del archivo
// son funciones puras (sin Prisma/Express, testeadas con node --test); al final va el router
// de solo lectura que las conecta con la base.
//
// REGLA DE ORO: nada acá escribe nada. Todo es sugerencia — "vos decidís".

import { Router } from 'express';
import { prisma } from './db';
import { getUserId } from './auth';
import { HttpError, ok } from './http';
import { dayBoundsMVD, localDayKeyMVD } from './time';

// ─── Constantes (umbrales nombrados, nada mágico disperso) ────────────────────

export const MIN_SESSIONS = 3; // sesiones mínimas antes de sugerir subir/mantener/bajar
export const INCREMENT_KG = 2.5; // incremento conservador al sugerir "subir"
export const STALL_WINDOW = 3; // sesiones sin mejora para considerar meseta
export const DELOAD_PCT_MIN = 0.10; // rango sugerido de reducción en la semana de descarga
export const DELOAD_PCT_MAX = 0.20;

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type SetLike = { weight: number; reps: number; rir?: number | null };

// Un grupo de series ya agrupadas por sesión (día local) por quien llama a este módulo
// (el endpoint agrupa con dayBoundsMVD/localDayKeyMVD, igual que /exercises/:id/last).
export type SessionInput = { dayKey: string; date: string; sets: SetLike[] };

// Resumen de una sesión: la serie "top" (mayor peso; empate → mayor 1RM estimado) representa
// el esfuerzo principal de esa sesión para comparar entre sesiones.
export type SessionSummary = {
  dayKey: string;
  date: string;
  topWeight: number;
  topReps: number;
  topRir: number | null;
  best1RM: number;
};

export type LoadAction = 'subir' | 'mantener' | 'bajar' | 'sin-datos';
export type Confidence = 'alta' | 'media' | 'baja';

export type LoadSuggestion = {
  action: LoadAction;
  suggestedWeight?: number;
  rationale: string;
  confidence: Confidence;
  rirUsed: boolean;
};

export type StallResult = {
  deloadSuggested: boolean;
  rationale: string;
  sessionsAnalyzed: number;
  eligible: boolean; // true si hubo sesiones suficientes para evaluar meseta
  deloadPctMin?: number;
  deloadPctMax?: number;
};

// Resultado de combinar el detectStall de varios ejercicios en un único aviso por rutina
// (decisión de Santi: el deload es GLOBAL por rutina, no por ejercicio).
export type RoutineStallResult = {
  deloadSuggested: boolean;
  rationale: string;
  eligibleExercises: number;
  stalledExercises: number;
  deloadPctMin?: number;
  deloadPctMax?: number;
};

// ─── est1RM (Epley) ─────────────────────────────────────────────────────────────
// DECISIÓN: centralizado acá; api/src/sets.ts lo importa (antes estaba duplicado). El
// frontend mantiene su propia copia en ProgressScreen.tsx porque no hay paquete compartido
// api/web y crear uno sería sobre-ingeniería para esta app.
export function est1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

// ─── summarizeSessions ──────────────────────────────────────────────────────────
// Filtra outliers (peso ≤ 0, reps ≤ 0) dentro de cada sesión y se queda con la serie "top".
// Sesiones que quedan sin series válidas tras filtrar se excluyen. Devuelve ordenado por
// dayKey ascendente (más vieja primero), para que "la última" sea sessions[length - 1].
export function summarizeSessions(sessions: SessionInput[]): SessionSummary[] {
  const summaries: SessionSummary[] = [];
  for (const session of sessions) {
    const validSets = session.sets.filter((s) => s.weight > 0 && s.reps > 0);
    if (validSets.length === 0) continue;

    let top = validSets[0];
    let topRM = est1RM(top.weight, top.reps);
    for (const s of validSets.slice(1)) {
      if (s.weight > top.weight || (s.weight === top.weight && est1RM(s.weight, s.reps) > topRM)) {
        top = s;
        topRM = est1RM(s.weight, s.reps);
      }
    }

    summaries.push({
      dayKey: session.dayKey,
      date: session.date,
      topWeight: top.weight,
      topReps: top.reps,
      topRir: top.rir ?? null,
      best1RM: topRM,
    });
  }
  return summaries.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

// ─── suggestLoad ────────────────────────────────────────────────────────────────
// Doble progresión + RIR (punto 11): con RIR cargado, cumplir el objetivo con margen (RIR ≥ 2)
// sugiere subir; RIR bajo (0-1) sugiere mantener o bajar. Sin RIR, degrada a comparar la
// tendencia del 1RM estimado reciente, con confianza más baja.
export function suggestLoad(
  sessions: SessionSummary[],
  opts: { targetReps?: number; minSessions?: number; increment?: number } = {},
): LoadSuggestion {
  const minSessions = opts.minSessions ?? MIN_SESSIONS;
  const increment = opts.increment ?? INCREMENT_KG;

  if (sessions.length < minSessions) {
    const faltan = minSessions - sessions.length;
    return {
      action: 'sin-datos',
      rationale: `Necesitás ${faltan} ${faltan === 1 ? 'sesión' : 'sesiones'} más para una sugerencia confiable (mínimo ${minSessions}).`,
      confidence: 'baja',
      rirUsed: false,
    };
  }

  const last = sessions[sessions.length - 1];
  const targetReps = opts.targetReps ?? last.topReps;
  const metReps = last.topReps >= targetReps;

  if (last.topRir != null) {
    if (metReps && last.topRir >= 2) {
      return {
        action: 'subir',
        suggestedWeight: Math.round((last.topWeight + increment) * 100) / 100,
        rationale: `Última sesión: ${last.topWeight}kg x${last.topReps} con RIR ${last.topRir} — cumpliste el objetivo con margen, podés subir el peso.`,
        confidence: 'alta',
        rirUsed: true,
      };
    }
    if (last.topRir <= 1 && !metReps) {
      return {
        action: 'bajar',
        rationale: `Última sesión: ${last.topWeight}kg x${last.topReps} con RIR ${last.topRir} — no llegaste a las reps objetivo y con poco margen; considerá bajar el peso.`,
        confidence: 'alta',
        rirUsed: true,
      };
    }
    return {
      action: 'mantener',
      rationale: `Última sesión: ${last.topWeight}kg x${last.topReps} con RIR ${last.topRir} — mantené el peso una sesión más.`,
      confidence: 'alta',
      rirUsed: true,
    };
  }

  // Degradación elegante sin RIR: comparar tendencia de 1RM estimado de las últimas sesiones.
  const recent = sessions.slice(-Math.min(3, sessions.length));
  const improving = recent.length >= 2 && recent[recent.length - 1].best1RM > recent[0].best1RM;
  const declining = recent.length >= 2 && recent[recent.length - 1].best1RM < recent[0].best1RM;

  if (metReps && improving) {
    return {
      action: 'subir',
      suggestedWeight: Math.round((last.topWeight + increment) * 100) / 100,
      rationale: `Sin RIR cargado: tu 1RM estimado viene subiendo y cumpliste las reps — podés probar con más peso.`,
      confidence: 'media',
      rirUsed: false,
    };
  }
  if (!metReps && declining) {
    return {
      action: 'bajar',
      rationale: `Sin RIR cargado: no llegaste a las reps objetivo y tu 1RM estimado viene bajando — considerá bajar el peso.`,
      confidence: 'baja',
      rirUsed: false,
    };
  }
  return {
    action: 'mantener',
    rationale: `Sin RIR cargado: con los datos disponibles, mantené el peso una sesión más.`,
    confidence: 'media',
    rirUsed: false,
  };
}

// ─── detectStall ────────────────────────────────────────────────────────────────
// Punto 10: si el mejor set (1RM estimado) no mejora en `window` sesiones seguidas, hay
// meseta → sugiere una semana de descarga (bajar volumen/intensidad 10-20%).
export function detectStall(
  sessions: SessionSummary[],
  opts: { window?: number } = {},
): StallResult {
  const window = opts.window ?? STALL_WINDOW;

  if (sessions.length < window) {
    return {
      deloadSuggested: false,
      rationale: `Necesitás al menos ${window} sesiones para evaluar si hay meseta (tenés ${sessions.length}).`,
      sessionsAnalyzed: sessions.length,
      eligible: false,
    };
  }

  const recent = sessions.slice(-window);
  let improved = false;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].best1RM > recent[i - 1].best1RM) {
      improved = true;
      break;
    }
  }

  if (improved) {
    return {
      deloadSuggested: false,
      rationale: `Tu 1RM estimado mejoró en alguna de las últimas ${window} sesiones — seguís progresando.`,
      sessionsAnalyzed: window,
      eligible: true,
    };
  }

  return {
    deloadSuggested: true,
    rationale: `Tu mejor set (1RM estimado) no mejoró en las últimas ${window} sesiones — podría convenir una semana de descarga.`,
    sessionsAnalyzed: window,
    eligible: true,
    deloadPctMin: DELOAD_PCT_MIN,
    deloadPctMax: DELOAD_PCT_MAX,
  };
}

// ─── summarizeRoutineStall ───────────────────────────────────────────────────────
// Combina el detectStall de cada ejercicio de una rutina en un único aviso (deload global,
// decisión de Santi). Regla: si la mayoría de los ejercicios CON datos suficientes están en
// meseta, se sugiere la semana de descarga para toda la rutina.
export function summarizeRoutineStall(perExercise: StallResult[]): RoutineStallResult {
  const eligible = perExercise.filter((r) => r.eligible);
  if (eligible.length === 0) {
    return {
      deloadSuggested: false,
      rationale: 'Todavía no hay suficientes sesiones en los ejercicios de esta rutina para evaluar meseta.',
      eligibleExercises: 0,
      stalledExercises: 0,
    };
  }

  const stalled = eligible.filter((r) => r.deloadSuggested);
  const deloadSuggested = stalled.length / eligible.length >= 0.5;

  if (!deloadSuggested) {
    return {
      deloadSuggested: false,
      rationale: `${stalled.length} de ${eligible.length} ejercicios con datos suficientes están en meseta — todavía no alcanza para sugerir una semana de descarga.`,
      eligibleExercises: eligible.length,
      stalledExercises: stalled.length,
    };
  }

  return {
    deloadSuggested: true,
    rationale: `${stalled.length} de ${eligible.length} ejercicios con datos suficientes están en meseta — podría convenir una semana de descarga para toda la rutina.`,
    eligibleExercises: eligible.length,
    stalledExercises: stalled.length,
    deloadPctMin: DELOAD_PCT_MIN,
    deloadPctMax: DELOAD_PCT_MAX,
  };
}

// ─── Router de solo lectura (/analysis) ─────────────────────────────────────────
// Todos requireAuth (montado en server.ts), scoping por userId con findFirst({ id, userId })
// (mismo patrón anti-IDOR que body-weight.ts), envelope { success, data }. CERO escrituras.

export const analysisRouter = Router();

// Trae las series de un ejercicio ya agrupadas en sesiones por día local (mismo criterio que
// /exercises/:id/last y ProgressScreen: hora Uruguay, no UTC).
async function loadExerciseSessions(exerciseId: string): Promise<SessionSummary[]> {
  const sets = await prisma.workoutSet.findMany({
    where: { exerciseId },
    orderBy: { date: 'asc' },
  });
  const byDay = new Map<string, SessionInput>();
  for (const s of sets) {
    const dayKey = localDayKeyMVD(s.date);
    const existing = byDay.get(dayKey);
    if (existing) {
      existing.sets.push({ weight: s.weight, reps: s.reps, rir: s.rir });
    } else {
      byDay.set(dayKey, {
        dayKey,
        date: dayBoundsMVD(s.date).start.toISOString(),
        sets: [{ weight: s.weight, reps: s.reps, rir: s.rir }],
      });
    }
  }
  return summarizeSessions([...byDay.values()]);
}

// GET /analysis/exercise/:id — sugerencia de carga (subir/mantener/bajar/sin-datos).
analysisRouter.get('/exercise/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const exercise = await prisma.exercise.findFirst({ where: { id, userId } });
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado');

  const sessions = await loadExerciseSessions(id);
  const suggestion = suggestLoad(sessions);
  ok(res, suggestion);
});

// GET /analysis/routine/:id/deload — aviso global de semana de descarga para la rutina.
analysisRouter.get('/routine/:id/deload', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const routine = await prisma.routine.findFirst({
    where: { id, userId },
    include: { days: { include: { exercises: { select: { exerciseId: true } } } } },
  });
  if (!routine) throw new HttpError(404, 'Rutina no encontrada');

  const exerciseIds = new Set<string>();
  for (const day of routine.days) {
    for (const item of day.exercises) exerciseIds.add(item.exerciseId);
  }

  const stallResults: StallResult[] = [];
  for (const exerciseId of exerciseIds) {
    const sessions = await loadExerciseSessions(exerciseId);
    stallResults.push(detectStall(sessions));
  }

  const summaryResult = summarizeRoutineStall(stallResults);
  ok(res, summaryResult);
});
