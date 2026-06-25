import { useCallback, useEffect, useState } from 'react';
import type { BodyWeightEntry } from '../types';
import { getBodyWeights, createBodyWeight, deleteBodyWeight } from '../api/bodyWeight';
import type { CreateBodyWeightInput } from '../api/bodyWeight';

type Status = 'loading' | 'error' | 'ready';

export function useBodyWeight() {
  const [status, setStatus] = useState<Status>('loading');
  const [entries, setEntries] = useState<BodyWeightEntry[]>([]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await getBodyWeights();
      setEntries(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addEntry = useCallback(async (input: CreateBodyWeightInput): Promise<boolean> => {
    const { entry, updated } = await createBodyWeight(input);
    setEntries((prev) =>
      updated
        ? prev.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...prev],
    );
    return updated;
  }, []);

  const removeEntry = useCallback(async (id: string): Promise<void> => {
    const prev = entries;
    setEntries((current) => current.filter((e) => e.id !== id));
    try {
      await deleteBodyWeight(id);
    } catch (e) {
      setEntries(prev);
      throw e;
    }
  }, [entries]);

  return { status, entries, reload: load, addEntry, removeEntry };
}
