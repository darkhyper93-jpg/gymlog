import { useCallback, useEffect, useState } from 'react';
import type { Achievement } from '../types';
import { getAchievements } from '../api/achievements';

type Status = 'loading' | 'error' | 'ready';

export function useAchievements() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await getAchievements();
      setAchievements(data);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { achievements, status, error, reload: load };
}
