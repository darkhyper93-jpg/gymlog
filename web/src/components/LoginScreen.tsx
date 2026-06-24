import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui';
import { AlertTriangleIcon, DumbbellIcon, EyeIcon, EyeOffIcon, LockIcon, UserIcon } from './icons';

type Mode = 'login' | 'register';

// Pantalla de login/registro: puerta de entrada a la app. Mobile-first, con estado de carga
// (botón deshabilitado) y de error (caja de error clara debajo del form).
export function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = username.trim().length >= 3 && password.length >= 6 && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(username.trim(), password);
      // Si sale bien, useAuth setea el token y App muestra la app: no hace falta nada más acá.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación');
    } finally {
      setSaving(false);
    }
  }

  function selectMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-12">
      {/* Marca: badge con icono + wordmark, da identidad sin gritar. */}
      <header className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-brand/20 bg-brand/10">
          <DumbbellIcon className="h-8 w-8 text-brand" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">gymlog</h1>
        <p className="mt-1 text-sm text-muted">Registrá. Superá. Repetí.</p>
      </header>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
        {/* Tabs Ingresar / Crear cuenta */}
        <div className="mb-6 flex rounded-lg border border-border/60 bg-surface-lowest p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => selectMode(m)}
              className={`flex-1 cursor-pointer rounded-md py-2 text-sm font-medium transition-all
                ${mode === m ? 'bg-surface-2 text-brand shadow-sm' : 'text-muted hover:text-fg'}`}
            >
              {m === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="ml-1 text-xs font-medium text-muted">Usuario</span>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu nombre de usuario"
                aria-label="Usuario"
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                className="min-h-[48px] w-full rounded-lg border border-border bg-surface-lowest pl-11 pr-4
                  text-base text-fg placeholder:text-muted/60 outline-none transition-all
                  focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="ml-1 text-xs font-medium text-muted">Contraseña</span>
            <div className="relative">
              <LockIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                aria-label="Contraseña"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="min-h-[48px] w-full rounded-lg border border-border bg-surface-lowest pl-11 pr-11
                  text-base text-fg placeholder:text-muted/60 outline-none transition-all
                  focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted
                  transition-colors hover:text-brand"
              >
                {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </label>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
              <AlertTriangleIcon className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" disabled={!canSubmit}>
            {saving ? 'Cargando…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        {mode === 'login' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}{' '}
        <button
          type="button"
          onClick={() => selectMode(mode === 'login' ? 'register' : 'login')}
          className="cursor-pointer font-semibold text-brand underline-offset-4 hover:underline"
        >
          {mode === 'login' ? 'Crear una' : 'Ingresar'}
        </button>
      </p>
    </div>
  );
}
