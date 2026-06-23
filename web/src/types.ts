// Tipos que cruzan la frontera con la API. Reflejan el modelo del backend (schema.prisma).

export type Exercise = {
  id: string;
  name: string;
  target: string | null;
  muscleGroup: string | null; // clave de grupo muscular; null en ejercicios viejos
  createdAt: string; // ISO date string
};

export type WorkoutSet = {
  id: string;
  exerciseId: string;
  date: string; // ISO date string
  weight: number;
  reps: number;
  rir: number | null;
  createdAt: string;
};

// Respuesta de GET /exercises/:id/last — null si nunca se registró nada.
export type LastSession = {
  date: string;
  sets: WorkoutSet[];
} | null;
