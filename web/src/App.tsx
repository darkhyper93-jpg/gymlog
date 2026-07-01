import { useState } from 'react';
import type { Exercise } from './types';
import { ExercisesScreen } from './components/ExercisesScreen';
import { RegisterScreen } from './components/RegisterScreen';
import { RoutinesScreen } from './components/RoutinesScreen';
import { ProgressScreen } from './components/ProgressScreen';
import { AchievementsScreen } from './components/AchievementsScreen';
import { MacrosScreen } from './components/MacrosScreen';
import { LoginScreen } from './components/LoginScreen';
import { NavBar, TopNav } from './components/NavBar';
import { IconButton } from './components/ui';
import { ChevronLeftIcon, LogOutIcon } from './components/icons';
import { useAuth } from './hooks/useAuth';
import { NotificationButton, NotificationModal } from './components/NotificationSettings';
import { useIosInstall } from './hooks/useIosInstall';
import { IosInstallModal } from './components/IosInstallModal';
import { RestTimerProvider } from './timer/RestTimerContext';
import { RestTimer } from './components/RestTimer';

// DECISIÓN: sin router (igual que V1). Con 5 tabs + sub-vista register, un par de estados
// sigue siendo más simple que añadir react-router a este proyecto pequeño.
export type Tab = 'ejercicios' | 'rutinas' | 'progreso' | 'logros' | 'macros';

const TAB_LABELS: Record<Tab, string> = {
  ejercicios: 'Tus ejercicios',
  rutinas: 'Tus rutinas',
  progreso: 'Tu progreso',
  logros: 'Tus logros',
  macros: 'Macros y agua',
};

// Sub-vista register: se abre desde Ejercicios o desde un día de rutina; el botón ← vuelve.
type SubView =
  | { name: 'register'; exercise: Exercise; plannedRestSeconds?: number | null; showSuggestion?: boolean }
  | null;

export default function App() {
  const { isAuthed, logout } = useAuth();
  const { eligible: iosEligible } = useIosInstall();
  const [tab, setTab] = useState<Tab>('ejercicios');
  const [subView, setSubView] = useState<SubView>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showIosInstall, setShowIosInstall] = useState(false);

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
    <RestTimerProvider>
    <div className="flex min-h-full w-full flex-col">
      {/* Header fijo: wordmark + top nav en desktop + logout.
          DECISIÓN: el header siempre usa max-w-4xl en desktop, independiente del wideClass
          del contenido. La top-nav tiene 4 tabs con texto y no entra en max-w-md. */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full items-center gap-3 px-4 py-3 md:max-w-4xl">
          {isRegister && (
            <IconButton aria-label="Volver" onClick={() => setSubView(null)}>
              <ChevronLeftIcon className="h-5 w-5" />
            </IconButton>
          )}
          <div className="shrink-0">
            <h1 className="text-xl font-bold tracking-tight text-brand">gymlog</h1>
            <p className="whitespace-nowrap text-xs text-muted">
              {isRegister ? 'Registrar entrenamiento' : TAB_LABELS[tab]}
            </p>
          </div>
          {/* Top nav solo en desktop y fuera de la sub-vista register */}
          {!isRegister && (
            <div className="hidden md:flex ml-6 mr-auto">
              <TopNav tab={tab} onChange={handleTabChange} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            {iosEligible && (
              <button
                type="button"
                onClick={() => setShowIosInstall(true)}
                aria-label="Instalar app"
                className="flex h-9 items-center justify-center rounded-xl px-2.5 text-xs
                  font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                Instalar
              </button>
            )}
            <NotificationButton onClick={() => setShowNotifs(true)} />
            <IconButton aria-label="Cerrar sesión" onClick={logout}>
              <LogOutIcon className="h-5 w-5" />
            </IconButton>
          </div>
        </div>
      </header>

      {/* pb-24 en mobile para que la bottom-nav no tape el contenido; pb-12 en desktop */}
      <main className={`mx-auto w-full flex-1 px-4 pb-24 pt-5 md:pb-12 ${wideClass}`}>
        {isRegister ? (
          <RegisterScreen
            exercise={subView!.exercise}
            plannedRestSeconds={subView!.plannedRestSeconds}
            showSuggestion={subView!.showSuggestion}
          />
        ) : tab === 'ejercicios' ? (
          <ExercisesScreen
            onSelect={(exercise) => setSubView({ name: 'register', exercise })}
          />
        ) : tab === 'rutinas' ? (
          <RoutinesScreen
            onRegister={(exercise, plannedRestSeconds, showSuggestion) =>
              setSubView({ name: 'register', exercise, plannedRestSeconds, showSuggestion })
            }
          />
        ) : tab === 'progreso' ? (
          <ProgressScreen />
        ) : tab === 'logros' ? (
          <AchievementsScreen />
        ) : (
          <MacrosScreen />
        )}
      </main>

      {/* Bottom nav fija en mobile; hidden en desktop (la top nav va en el header) */}
      <NavBar tab={tab} onChange={handleTabChange} />

      {/* Timer global — visible en cualquier pantalla */}
      <RestTimer />

      {showNotifs && <NotificationModal onClose={() => setShowNotifs(false)} />}
      {showIosInstall && <IosInstallModal onClose={() => setShowIosInstall(false)} />}
    </div>
    </RestTimerProvider>
  );
}
