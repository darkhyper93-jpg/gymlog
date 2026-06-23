import { useCallback, useEffect, useState } from 'react';
import type { Exercise } from '../types';
import {
  createExercise,
  deleteExercise,
  listExercises,
  updateExercise,
} from '../api/exercises';

type Status = 'loading' | 'error' | 'ready';

// Hook de datos de ejercicios: centraliza los 4 estados (cargando/error/vacío/datos) y el CRUD.
// 'vacío' no es un status aparte: es ready con la lista en []; la UI lo distingue.
export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await listExercises();
      setExercises(data);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (input: { name: string; target?: string; muscleGroup: string }) => {
      const created = await createExercise(input);
      setExercises((prev) => [created, ...prev]);
    },
    [],
  );

  const edit = useCallback(
    async (id: string, input: { name?: string; target?: string; muscleGroup?: string }) => {
      const updated = await updateExercise(id, input);
      setExercises((prev) => prev.map((ex) => (ex.id === id ? updated : ex)));
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await deleteExercise(id);
    setExercises((prev) => prev.filter((ex) => ex.id !== id));
  }, []);

  return { exercises, status, error, reload: load, add, edit, remove };
}
