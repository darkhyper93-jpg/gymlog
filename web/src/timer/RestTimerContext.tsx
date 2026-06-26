import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TimerState = {
  endsAt: number;   // Date.now() + seconds * 1000 en el momento de arrancar
  total: number;    // duración original en segundos
  running: boolean;
  paused: boolean;
  pausedRemaining: number | null; // segundos restantes en el momento de pausar
};

const STORAGE_KEY = 'rest-timer-state';

// ─── Persistencia ─────────────────────────────────────────────────────────────

function saveState(state: TimerState | null) {
  if (state === null) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function loadState(): TimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as TimerState;
    // Descartar timers ya vencidos al montar
    if (!s.paused && Date.now() > s.endsAt) return null;
    return s;
  } catch {
    return null;
  }
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

type TimerCtx = {
  remaining: number;
  total: number;
  running: boolean;
  active: boolean;
  start: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  adjust: (delta: number) => void;
  preset: (seconds: number) => void;
  close: () => void;
};

const RestTimerContext = createContext<TimerCtx | null>(null);

export function useRestTimer(): TimerCtx {
  const ctx = useContext(RestTimerContext);
  if (!ctx) throw new Error('useRestTimer must be used inside RestTimerProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [timerState, setTimerState] = useState<TimerState | null>(loadState);
  const [remaining, setRemaining] = useState<number>(() => {
    const s = loadState();
    if (!s) return 0;
    if (s.paused && s.pausedRemaining !== null) return s.pausedRemaining;
    return Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
  });
  const notifiedRef = useRef(false);

  // Calcula remaining a partir del estado (timestamp-based — preciso tras background)
  function calcRemaining(s: TimerState): number {
    if (s.paused && s.pausedRemaining !== null) return s.pausedRemaining;
    return Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
  }

  // ─── Tick basado en timestamp ──────────────────────────────────────────────
  useEffect(() => {
    if (!timerState || !timerState.running || timerState.paused) return;
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.round((timerState.endsAt - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(id);
  }, [timerState]);

  // Corregir remaining al volver de segundo plano
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible' && timerState) {
        setRemaining(calcRemaining(timerState));
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [timerState]);

  // ─── Notificación al terminar ──────────────────────────────────────────────
  useEffect(() => {
    if (remaining === 0 && timerState && !notifiedRef.current) {
      notifiedRef.current = true;
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      // Notificación solo si el permiso ya está concedido (se reutiliza el del push)
      if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          void reg.showNotification('¡Descanso terminado! 💪', {
            body: 'Ya podés arrancar la próxima serie.',
            icon: '/pwa-192x192.png',
            badge: '/pwa-64x64.png',
            tag: 'rest-timer-done',
          });
        });
      }
    }
  }, [remaining, timerState]);

  // ─── Acciones ─────────────────────────────────────────────────────────────

  const start = useCallback((seconds: number) => {
    notifiedRef.current = false;
    const s: TimerState = {
      endsAt: Date.now() + seconds * 1000,
      total: seconds,
      running: true,
      paused: false,
      pausedRemaining: null,
    };
    setTimerState(s);
    setRemaining(seconds);
    saveState(s);
  }, []);

  const pause = useCallback(() => {
    setTimerState((prev) => {
      if (!prev || prev.paused) return prev;
      const rem = calcRemaining(prev);
      const next: TimerState = { ...prev, paused: true, running: false, pausedRemaining: rem };
      saveState(next);
      setRemaining(rem);
      return next;
    });
  }, []);

  const resume = useCallback(() => {
    setTimerState((prev) => {
      if (!prev || !prev.paused || prev.pausedRemaining === null) return prev;
      notifiedRef.current = false;
      const next: TimerState = {
        ...prev,
        endsAt: Date.now() + prev.pausedRemaining * 1000,
        running: true,
        paused: false,
        pausedRemaining: null,
      };
      saveState(next);
      return next;
    });
  }, []);

  const adjust = useCallback((delta: number) => {
    setTimerState((prev) => {
      if (!prev) return prev;
      if (prev.paused && prev.pausedRemaining !== null) {
        const newRem = Math.max(0, prev.pausedRemaining + delta);
        const next: TimerState = { ...prev, pausedRemaining: newRem };
        setRemaining(newRem);
        if (newRem > 0) notifiedRef.current = false;
        saveState(next);
        return next;
      }
      const newEndsAt = prev.endsAt + delta * 1000;
      const newRem = Math.max(0, Math.round((newEndsAt - Date.now()) / 1000));
      if (newRem > 0) notifiedRef.current = false;
      const next: TimerState = { ...prev, endsAt: newEndsAt, running: newRem > 0 };
      setRemaining(newRem);
      saveState(next);
      return next;
    });
  }, []);

  const preset = useCallback((seconds: number) => {
    notifiedRef.current = false;
    const s: TimerState = {
      endsAt: Date.now() + seconds * 1000,
      total: seconds,
      running: true,
      paused: false,
      pausedRemaining: null,
    };
    setTimerState(s);
    setRemaining(seconds);
    saveState(s);
  }, []);

  const close = useCallback(() => {
    setTimerState(null);
    setRemaining(0);
    notifiedRef.current = false;
    saveState(null);
  }, []);

  const active = timerState !== null;
  const running = timerState?.running ?? false;
  const total = timerState?.total ?? 0;

  return (
    <RestTimerContext.Provider value={{ remaining, total, running, active, start, pause, resume, adjust, preset, close }}>
      {children}
    </RestTimerContext.Provider>
  );
}
