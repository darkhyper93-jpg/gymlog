import { useState } from 'react';
import type { Exercise } from './types';
import { ExercisesScreen } from './components/ExercisesScreen';
import { RegisterScreen } from './components/RegisterScreen';
import { LoginScreen } from './components/LoginScreen';
import { IconButton } from './components/ui';
import { ChevronLeftIcon, LogOutIcon } from './components/icons';
import { useAuth } from './hooks/useAuth';

// Navegación mínima sin router: dos vistas (lista de ejercicios / registrar hoy).
// DECISIÓN: para una app de dos pantallas un router es sobre-ingeniería; un estado alcanza.
type View = { name: 'list' } | { name: 'register'; exercise: Exercise };

export default function App() {
  const { isAuthed, logout } = useAuth();
  const [view, setView] = useState<View>({ name: 'list' });

  // Portero: sin sesión, solo se ve el login. El resto de la app queda detrás del token.
  if (!isAuthed) return <LoginScreen />;

  // Mobile-first: angosto en el celu. En la lista, en pantalla ancha se ensancha para
  // mostrar los grupos en columnas; el registro queda siempre angosto (foco en una cosa).
  const widthClass = view.name === 'list' ? 'max-w-md md:max-w-4xl' : 'max-w-md';

  return (
    <div className="flex min-h-full w-full flex-col">
      {/* Header fijo: en 'register' muestra ← para volver; siempre el título de marca. */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className={`mx-auto flex w-full items-center gap-2 px-4 py-3 ${widthClass}`}>
          {view.name === 'register' && (
            <IconButton aria-label="Volver" onClick={() => setView({ name: 'list' })}>
              <ChevronLeftIcon className="h-5 w-5" />
            </IconButton>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">gymlog</h1>
            <p className="text-xs text-muted">
              {view.name === 'list' ? 'Tus ejercicios' : 'Registrar entrenamiento'}
            </p>
          </div>
          <IconButton aria-label="Cerrar sesión" onClick={logout} className="ml-auto">
            <LogOutIcon className="h-5 w-5" />
          </IconButton>
        </div>
      </header>

      <main className={`mx-auto w-full flex-1 px-4 pb-12 pt-5 ${widthClass}`}>
        {view.name === 'list' ? (
          <ExercisesScreen onSelect={(exercise) => setView({ name: 'register', exercise })} />
        ) : (
          <RegisterScreen exercise={view.exercise} />
        )}
      </main>
    </div>
  );
}
