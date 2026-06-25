import { useCallback, useEffect, useState } from 'react';
import type { WorkoutSet } from '../types';
import { getTodaySets } from '../api/sets';

// Fetcha las series de hoy (hora Uruguay) y las agrupa por exerciseId.
// Null mientras carga, Map vacío si hubo error (no bloquea la UI de rutinas).
export function useTodaySets() {
  const [byExercise, setByExercise] = useState<Map<string, WorkoutSet[]> | null>(null);

  const load = useCallback(async () => {
    try {
      const sets = await getTodaySets();
      const map = new Map<string, WorkoutSet[]>();
      for (const s of sets) {
        const bucket = map.get(s.exerciseId);
        if (bucket) bucket.push(s);
        else map.set(s.exerciseId, [s]);
      }
      setByExercise(map);
    } catch {
      setByExercise(new Map());
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { byExercise, reload: load };
}
