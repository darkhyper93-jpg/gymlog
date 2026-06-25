import { useCallback, useEffect, useState } from 'react';
import type { Achievement, WorkoutSet } from '../types';
import { getExerciseSets } from '../api/exercises';
import { createSet, deleteSet, updateSet } from '../api/sets';
import type { UpdateSetInput } from '../api/sets';

type Status = 'loading' | 'error' | 'ready';

export type DaySession = { dayKey: string; date: string; sets: WorkoutSet[] };

// Clave de día en horario local (no UTC) para agrupar series por sesión.
// DECISIÓN: agrupamos por día local porque entrenar es un evento local; usar UTC
// partiría una sesión nocturna en dos días.
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey(): string {
  return localDayKey(new Date().toISOString());
}

// Hook del corazón del V1: trae el historial del ejercicio y lo separa en
// "series de hoy" y "última sesión a superar" (la más reciente que no sea hoy).
export function useRegister(exerciseId: string) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [todaySets, setTodaySets] = useState<WorkoutSet[]>([]);
  const [reference, setReference] = useState<DaySession | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const history = await getExerciseSets(exerciseId); // más nuevo primero
      const today = todayKey();
      const mine: WorkoutSet[] = [];
      const groups = new Map<string, DaySession>();
      for (const set of history) {
        const key = localDayKey(set.date);
        if (key === today) {
          mine.push(set);
          continue;
        }
        const existing = groups.get(key);
        if (existing) existing.sets.push(set);
        else groups.set(key, { dayKey: key, date: set.date, sets: [set] });
      }
      // history viene desc, así que el primer grupo no-hoy es la última sesión previa.
      const ref = groups.size > 0 ? [...groups.values()][0] : null;
      // Las series de hoy las quiero más viejo→más nuevo (orden en que las cargué).
      mine.reverse();
      setTodaySets(mine);
      setReference(ref);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setStatus('error');
    }
  }, [exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Alta optimista: muestro la serie al toque y la confirmo con el server;
  // si falla, hago rollback y propago el error para que el form lo muestre.
  // Retorna los flags de PR y los logros recién desbloqueados.
  const addSet = useCallback(
    async (input: {
      weight: number;
      reps: number;
      rir?: number;
    }): Promise<{ weightPR: boolean; oneRmPR: boolean; achievements: Achievement[] }> => {
      const temp: WorkoutSet = {
        id: `temp-${Date.now()}`,
        exerciseId,
        date: new Date().toISOString(),
        weight: input.weight,
        reps: input.reps,
        rir: input.rir ?? null,
        createdAt: new Date().toISOString(),
      };
      setTodaySets((prev) => [...prev, temp]);
      try {
        const { set: created, prs, achievements } = await createSet({ exerciseId, ...input });
        setTodaySets((prev) => prev.map((s) => (s.id === temp.id ? created : s)));
        return { ...prs, achievements };
      } catch (e) {
        setTodaySets((prev) => prev.filter((s) => s.id !== temp.id));
        throw e;
      }
    },
    [exerciseId],
  );

  // Borra una serie ya confirmada (no aplica a temp-). Optimista: la quita al toque
  // y hace rollback si el servidor falla.
  const removeSet = useCallback(
    async (id: string): Promise<void> => {
      if (id.startsWith('temp-')) return;
      const prev = todaySets;
      setTodaySets((current) => current.filter((s) => s.id !== id));
      try {
        await deleteSet(id);
      } catch (e) {
        setTodaySets(prev);
        throw e;
      }
    },
    [todaySets],
  );

  // Edita una serie ya confirmada. Optimista: actualiza el estado al toque y rollback si falla.
  const editSet = useCallback(
    async (id: string, input: UpdateSetInput): Promise<void> => {
      const prev = todaySets;
      setTodaySets((current) =>
        current.map((s) =>
          s.id === id
            ? {
                ...s,
                weight: input.weight ?? s.weight,
                reps: input.reps ?? s.reps,
                rir: input.rir !== undefined ? input.rir : s.rir,
              }
            : s,
        ),
      );
      try {
        const updated = await updateSet(id, input);
        setTodaySets((current) => current.map((s) => (s.id === id ? updated : s)));
      } catch (e) {
        setTodaySets(prev);
        throw e;
      }
    },
    [todaySets],
  );

  return { status, error, todaySets, reference, reload: load, addSet, removeSet, editSet };
}
