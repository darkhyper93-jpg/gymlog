// Grupos musculares: única fuente de verdad del frontend (clave = lo que guarda el backend,
// label = lo que se muestra). El orden define cómo se apilan las secciones en la pantalla.
export const MUSCLE_GROUPS = [
  { key: 'pecho', label: 'Pecho' },
  { key: 'espalda', label: 'Espalda' },
  { key: 'hombro', label: 'Hombro' },
  { key: 'biceps', label: 'Bíceps' },
  { key: 'triceps', label: 'Tríceps' },
  { key: 'antebrazo', label: 'Antebrazo' },
  { key: 'trapecio', label: 'Trapecio' },
  { key: 'piernas', label: 'Piernas' },
  { key: 'core', label: 'Core' },
  { key: 'abdominales', label: 'Abdominales' },
] as const;

export type MuscleGroupKey = (typeof MUSCLE_GROUPS)[number]['key'];

const LABELS: Record<string, string> = Object.fromEntries(
  MUSCLE_GROUPS.map((g) => [g.key, g.label]),
);

// Label legible de una clave; "Otros" para ejercicios sin grupo (datos viejos).
export function muscleGroupLabel(key: string | null): string {
  if (key == null) return 'Otros';
  return LABELS[key] ?? key;
}
