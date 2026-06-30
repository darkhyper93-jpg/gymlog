import { useCallback, useEffect, useState } from 'react';
import type { MuscleGroup } from '../types';
import { createMuscleGroup, deleteMuscleGroup, listMuscleGroups } from '../api/muscleGroups';

type Status = 'loading' | 'error' | 'ready';

// Hook de datos de grupos musculares custom: centraliza los 4 estados y el CRUD.
export function useMuscleGroups() {
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await listMuscleGroups();
      setGroups(data);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async (name: string): Promise<MuscleGroup> => {
    const created = await createMuscleGroup(name);
    setGroups((prev) => [...prev, created]);
    return created;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteMuscleGroup(id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  return { groups, status, error, reload: load, add, remove };
}
