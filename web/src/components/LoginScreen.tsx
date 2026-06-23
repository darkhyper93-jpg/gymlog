import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button, Card, TextInput } from './ui';

type Mode = 'login' | 'register';

// Pantalla de login/registro: puerta de entrada a la app. Mobile-first, con estado de carga
// (botón deshabilitado) y de error (mensaje claro debajo del form).
export function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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

  function switchMode() {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setError(null);
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">gymlog</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === 'login' ? 'Entrá para registrar tu entrenamiento' : 'Creá tu cuenta'}
        </p>
      </header>

      <Card className="flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Usuario"
            aria-label="Usuario"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
          />
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            aria-label="Contraseña"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={!canSubmit}>
            {saving ? 'Cargando…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Button>
        </form>
      </Card>

      <button
        type="button"
        onClick={switchMode}
        className="mx-auto mt-5 cursor-pointer text-sm text-muted underline-offset-4
          transition-colors hover:text-fg hover:underline"
      >
        {mode === 'login' ? '¿No tenés cuenta? Registrate' : '¿Ya tenés cuenta? Entrá'}
      </button>
    </div>
  );
}
