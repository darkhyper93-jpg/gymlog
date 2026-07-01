// Motor puro de autorregulación: predicción de carga por ejercicio (doble progresión + RIR)
// y detección de meseta para sugerir una semana de descarga. Funciones puras, sin Prisma ni
// Express, para poder testearlas con node --test sin base de datos.
//
// REGLA DE ORO: nada acá escribe nada. Todo es sugerencia — "vos decidís".

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
    };
  }

  return {
    deloadSuggested: true,
    rationale: `Tu mejor set (1RM estimado) no mejoró en las últimas ${window} sesiones — podría convenir una semana de descarga.`,
    sessionsAnalyzed: window,
    deloadPctMin: DELOAD_PCT_MIN,
    deloadPctMax: DELOAD_PCT_MAX,
  };
}
