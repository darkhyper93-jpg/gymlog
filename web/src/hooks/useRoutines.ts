import { useCallback, useEffect, useState } from 'react';
import type { Routine, RoutineDay, RoutineDayExercise } from '../types';
import {
  listRoutines,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  createRoutineDay,
  updateRoutineDay,
  deleteRoutineDay,
  addExerciseToDay,
  removeDayExercise,
  reorderDayExercises,
  reorderRoutineDays,
  updateDayExercise,
  type ItemPlanPatch,
} from '../api/routines';

type Status = 'loading' | 'error' | 'ready';

// ─── Helpers de actualización del estado anidado ──────────────────────────────

function mapRoutine(routines: Routine[], id: string, fn: (r: Routine) => Routine): Routine[] {
  return routines.map((r) => (r.id === id ? fn(r) : r));
}

function mapDay(
  routines: Routine[],
  routineId: string,
  dayId: string,
  fn: (d: RoutineDay) => RoutineDay,
): Routine[] {
  return mapRoutine(routines, routineId, (r) => ({
    ...r,
    days: r.days.map((d) => (d.id === dayId ? fn(d) : d)),
  }));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRoutines() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await listRoutines();
      setRoutines(data);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ─── Rutinas ───────────────────────────────────────────────────────────────

  const addRoutine = useCallback(async (name: string): Promise<Routine> => {
    const created = await createRoutine(name);
    setRoutines((prev) => [...prev, created]);
    return created;
  }, []);

  const editRoutine = useCallback(async (id: string, name: string) => {
    const updated = await updateRoutine(id, { name });
    setRoutines((prev) => mapRoutine(prev, id, (r) => ({ ...r, name: updated.name })));
  }, []);

  const removeRoutine = useCallback(async (id: string) => {
    await deleteRoutine(id);
    setRoutines((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Activar/desactivar sugerencias de carga/deload de la rutina. Al activar sin ejercicios
  // con peso registrado, el backend rechaza con 400 (el mensaje trae la lista de faltantes);
  // se propaga el error para que la UI lo muestre, sin tocar el estado local.
  const setAutoDeload = useCallback(async (id: string, enabled: boolean) => {
    const updated = await updateRoutine(id, { autoDeloadEnabled: enabled });
    setRoutines((prev) =>
      mapRoutine(prev, id, (r) => ({ ...r, autoDeloadEnabled: updated.autoDeloadEnabled })),
    );
  }, []);

  // ─── Días ─────────────────────────────────────────────────────────────────

  const addDay = useCallback(async (routineId: string, name: string): Promise<RoutineDay> => {
    const day = await createRoutineDay(routineId, name);
    setRoutines((prev) =>
      mapRoutine(prev, routineId, (r) => ({ ...r, days: [...r.days, day] })),
    );
    return day;
  }, []);

  const editDay = useCallback(async (routineId: string, dayId: string, name: string) => {
    const updated = await updateRoutineDay(dayId, { name });
    setRoutines((prev) => mapDay(prev, routineId, dayId, (d) => ({ ...d, name: updated.name })));
  }, []);

  const removeDay = useCallback(async (routineId: string, dayId: string) => {
    await deleteRoutineDay(dayId);
    setRoutines((prev) =>
      mapRoutine(prev, routineId, (r) => ({
        ...r,
        days: r.days.filter((d) => d.id !== dayId),
      })),
    );
  }, []);

  const reorderDays = useCallback(
    async (routineId: string, dayIds: string[]): Promise<void> => {
      setRoutines((prev) =>
        mapRoutine(prev, routineId, (r) => ({
          ...r,
          days: dayIds.reduce<RoutineDay[]>((acc, id, idx) => {
            const d = r.days.find((day) => day.id === id);
            if (d) acc.push({ ...d, order: idx });
            return acc;
          }, []),
        })),
      );
      try {
        await reorderRoutineDays(routineId, dayIds);
      } catch (e) {
        void load();
        throw e;
      }
    },
    [load],
  );

  // ─── Ejercicios del día ───────────────────────────────────────────────────

  const addExercise = useCallback(
    async (routineId: string, dayId: string, exerciseId: string): Promise<RoutineDayExercise> => {
      const item = await addExerciseToDay(dayId, exerciseId);
      setRoutines((prev) =>
        mapDay(prev, routineId, dayId, (d) => ({
          ...d,
          exercises: [...d.exercises, item],
        })),
      );
      return item;
    },
    [],
  );

  const removeExercise = useCallback(async (routineId: string, dayId: string, itemId: string) => {
    await removeDayExercise(itemId);
    setRoutines((prev) =>
      mapDay(prev, routineId, dayId, (d) => ({
        ...d,
        exercises: d.exercises.filter((e) => e.id !== itemId),
      })),
    );
  }, []);

  const reorderExercises = useCallback(
    async (routineId: string, dayId: string, itemIds: string[]): Promise<void> => {
      setRoutines((prev) =>
        mapDay(prev, routineId, dayId, (d) => ({
          ...d,
          exercises: itemIds.reduce<RoutineDayExercise[]>((acc, id, idx) => {
            const ex = d.exercises.find((e) => e.id === id);
            if (ex) acc.push({ ...ex, order: idx });
            return acc;
          }, []),
        })),
      );
      try {
        await reorderDayExercises(dayId, itemIds);
      } catch (e) {
        void load();
        throw e;
      }
    },
    [load],
  );

  const editItemPlan = useCallback(
    async (routineId: string, dayId: string, itemId: string, patch: ItemPlanPatch) => {
      const updated = await updateDayExercise(itemId, patch);
      setRoutines((prev) =>
        mapDay(prev, routineId, dayId, (d) => ({
          ...d,
          exercises: d.exercises.map((e) => (e.id === itemId ? updated : e)),
        })),
      );
    },
    [],
  );

  return {
    routines,
    status,
    error,
    reload: load,
    addRoutine,
    editRoutine,
    removeRoutine,
    setAutoDeload,
    addDay,
    editDay,
    removeDay,
    reorderDays,
    addExercise,
    removeExercise,
    reorderExercises,
    editItemPlan,
  };
}
