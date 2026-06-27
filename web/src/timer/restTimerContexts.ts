import { createContext, useContext } from 'react';

// Contextos y hooks del rest-timer, separados del Provider (componente) para no mezclar
// exports de componentes con exports de hooks (react-refresh/only-export-components).

// Acciones: referencias estables (no cambian con cada tick). Las consume RegisterScreen,
// que solo necesita disparar start() y NO debe re-renderizar cada 500ms.
export type TimerActions = {
  start: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  adjust: (delta: number) => void;
  preset: (seconds: number) => void;
  close: () => void;
};

// Estado volátil del countdown: remaining cambia cada 500ms. Solo lo consume RestTimer.
export type TimerStateValue = {
  remaining: number;
  total: number;
  running: boolean;
  active: boolean;
};

export const RestTimerActionsContext = createContext<TimerActions | null>(null);
export const RestTimerStateContext = createContext<TimerStateValue | null>(null);

export function useRestTimerActions(): TimerActions {
  const ctx = useContext(RestTimerActionsContext);
  if (!ctx) throw new Error('useRestTimerActions must be used inside RestTimerProvider');
  return ctx;
}

export function useRestTimerState(): TimerStateValue {
  const ctx = useContext(RestTimerStateContext);
  if (!ctx) throw new Error('useRestTimerState must be used inside RestTimerProvider');
  return ctx;
}
