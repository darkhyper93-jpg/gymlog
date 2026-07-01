import { useEffect, useState } from 'react';
import type { LoadSuggestion } from '../types';
import { getExerciseSuggestion } from '../api/analysis';

type Status = 'loading' | 'error' | 'ready';

// Sugerencia de carga (subir/mantener/bajar/sin-datos) para un ejercicio, solo lectura.
// Se usa en RegisterScreen cuando venís de una rutina con autoDeloadEnabled ON.
export function useSuggestion(exerciseId: string, enabled: boolean) {
  const [status, setStatus] = useState<Status>('loading');
  const [suggestion, setSuggestion] = useState<LoadSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus('loading');
    setError(null);
    getExerciseSuggestion(exerciseId)
      .then((data) => {
        if (cancelled) return;
        setSuggestion(data);
        setStatus('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Error desconocido');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [exerciseId, enabled]);

  return { status, suggestion, error };
}
