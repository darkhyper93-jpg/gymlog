import { useState } from 'react';
import type { Exercise } from './types';
import { ExercisesScreen } from './components/ExercisesScreen';
import { RegisterScreen } from './components/RegisterScreen';
import { RoutinesScreen } from './components/RoutinesScreen';
import { ProgressScreen } from './components/ProgressScreen';
import { AchievementsScreen } from './components/AchievementsScreen';
import { LoginScreen } from './components/LoginScreen';
import { NavBar, TopNav } from './components/NavBar';
import { IconButton } from './components/ui';
import { ChevronLeftIcon, LogOutIcon } from './components/icons';
import { useAuth } from './hooks/useAuth';

// DECISIÓN: sin router (igual que V1). Con 4 tabs + sub-vista register, un par de estados
// sigue siendo más simple que añadir react-router a este proyecto pequeño.
export type Tab = 'ejercicios' | 'rutinas' | 'progreso' | 'logros';

const TAB_LABELS: Record<Tab, string> = {
  ejercicios: 'Tus ejercicios',
  rutinas: 'Tus rutinas',
  progreso: 'Tu progreso',
  logros: 'Tus logros',
};

// Sub-vista register: se abre desde Ejercicios o desde un día de rutina; el botón ← vuelve.
type SubView = { name: 'register'; exercise: Exercise } | null;

export default function App() {
  const { isAuthed, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('ejercicios');
  const [subView, setSubView] = useState<SubView>(null);

  if (!isAuthed) return <LoginScreen />;

  const isRegister = subView?.name === 'register';

  function handleTabChange(t: Tab) {
    setTab(t);
    setSubView(null); // salir de register al cambiar de tab
  }

  // Lista y rutinas se ensanchan en desktop para mostrar columnas; el resto queda angosto.
  const wideClass =
    (tab === 'ejercicios' || tab === 'rutinas') && !isRegister
      ? 'max-w-md md:max-w-4xl'
      : 'max-w-md';

  return (
    <div className="flex min-h-full w-full flex-col">
      {/* Header fijo: wordmark + top nav en desktop + logout */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className={`mx-auto flex w-full items-center gap-2 px-4 py-3 ${wideClass}`}>
          {isRegister && (
            <IconButton aria-label="Volver" onClick={() => setSubView(null)}>
              <ChevronLeftIcon className="h-5 w-5" />
            </IconButton>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-brand">gymlog</h1>
            <p className="text-xs text-muted">
              {isRegister ? 'Registrar entrenamiento' : TAB_LABELS[tab]}
            </p>
          </div>
          {/* Top nav solo en desktop y fuera de la sub-vista register */}
          {!isRegister && (
            <div className="ml-4 mr-auto">
              <TopNav tab={tab} onChange={handleTabChange} />
            </div>
          )}
          <IconButton aria-label="Cerrar sesión" onClick={logout} className="ml-auto">
            <LogOutIcon className="h-5 w-5" />
          </IconButton>
        </div>
      </header>

      {/* pb-24 en mobile para que la bottom-nav no tape el contenido; pb-12 en desktop */}
      <main className={`mx-auto w-full flex-1 px-4 pb-24 pt-5 md:pb-12 ${wideClass}`}>
        {isRegister ? (
          <RegisterScreen exercise={subView!.exercise} />
        ) : tab === 'ejercicios' ? (
          <ExercisesScreen
            onSelect={(exercise) => setSubView({ name: 'register', exercise })}
          />
        ) : tab === 'rutinas' ? (
          <RoutinesScreen
            onRegister={(exercise) => setSubView({ name: 'register', exercise })}
          />
        ) : tab === 'progreso' ? (
          <ProgressScreen />
        ) : (
          <AchievementsScreen />
        )}
      </main>

      {/* Bottom nav fija en mobile; hidden en desktop (la top nav va en el header) */}
      <NavBar tab={tab} onChange={handleTabChange} />
    </div>
  );
}
