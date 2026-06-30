// Tipos que cruzan la frontera con la API. Reflejan el modelo del backend (schema.prisma).

export type Exercise = {
  id: string;
  name: string;
  target: string | null;
  muscleGroup: string | null; // clave de grupo muscular; null en ejercicios viejos
  restSeconds: number | null; // segundos de descanso objetivo para el timer; null = sin preferencia
  createdAt: string; // ISO date string
};

export type WorkoutSet = {
  id: string;
  exerciseId: string;
  date: string; // ISO date string
  weight: number;
  reps: number;
  rir: number | null;
  note: string | null;
  order: number;
  createdAt: string;
};

// Respuesta de GET /exercises/:id/last — null si nunca se registró nada.
export type LastSession = {
  date: string;
  sets: WorkoutSet[];
} | null;

// ─── Rutinas ─────────────────────────────────────────────────────────────────

export type RoutineDayExercise = {
  id: string;
  routineDayId: string;
  exerciseId: string;
  order: number;
  exercise: Exercise; // Exercise embebido (include del backend)
  // Campos del plan importado (B2). Todos opcionales: null si no se importó valor.
  plannedSets: number | null;
  plannedReps: string | null;
  plannedRir: string | null;
  restSeconds: number | null;
  note: string | null;
};

export type RoutineDay = {
  id: string;
  routineId: string;
  name: string;
  order: number;
  exercises: RoutineDayExercise[];
};

export type Routine = {
  id: string;
  name: string;
  userId: string;
  order: number;
  createdAt: string;
  days: RoutineDay[];
};

// ─── Importar rutinas ─────────────────────────────────────────────────────────

export type ImportExercise = {
  name: string | null; // null = "no encontrado" en el preview
  plannedSets: number | null;
  plannedReps: string | null;
  plannedRir: string | null;
  restSeconds: number | null;
  note: string | null;
};
export type ImportDay = { name: string | null; exercises: ImportExercise[] };
export type ImportRoutine = { name: string | null; days: ImportDay[] };

// ─── Peso corporal ────────────────────────────────────────────────────────────

export type BodyWeightEntry = {
  id: string;
  userId: string;
  date: string;
  weight: number;
  createdAt: string;
};

// ─── Logros ───────────────────────────────────────────────────────────────────

export type Achievement = {
  key: string;
  title: string;
  description: string;
  icon: string; // nombre del icono (mapeado a SVG en el frontend)
  unlocked: boolean;
  unlockedAt: string | null; // ISO date string
};
