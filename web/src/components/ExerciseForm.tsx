import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, TextInput } from './ui';
import { MUSCLE_GROUPS } from '../muscleGroups';

// Formulario reusado para crear y editar. onSubmit hace el await; el form maneja su propio
// estado de guardado y de error (para no dejar la pantalla muda si la API falla).
export function ExerciseForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; target: string; muscleGroup: string };
  submitLabel: string;
  onSubmit: (input: { name: string; target?: string; muscleGroup: string }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(initial?.target ?? '');
  const [muscleGroup, setMuscleGroup] = useState(initial?.muscleGroup ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() !== '' && muscleGroup !== '' && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), target: target.trim() || undefined, muscleGroup });
      if (!initial) {
        // Modo "crear": limpiar para cargar el siguiente rápido.
        setName('');
        setTarget('');
        setMuscleGroup('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="ml-1 text-xs font-semibold uppercase tracking-wide text-muted">Nombre</span>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Press banca"
          aria-label="Nombre del ejercicio"
          autoFocus={!!initial}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="ml-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Objetivo (opcional)
        </span>
        <TextInput
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Ej. 4x8-10 RIR2"
          aria-label="Objetivo"
        />
      </label>

      {/* Grupo muscular como grilla de pills (radio): más rápido de tocar en el celu que un select. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 ml-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Grupo muscular
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {MUSCLE_GROUPS.map((g) => (
            <label
              key={g.key}
              className="flex cursor-pointer items-center justify-center rounded-lg border border-border
                bg-surface-lowest px-3 py-3 text-sm font-medium text-fg transition-all
                hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-brand/10
                has-[:checked]:text-brand"
            >
              <input
                type="radio"
                name="muscleGroup"
                value={g.key}
                checked={muscleGroup === g.key}
                onChange={(e) => setMuscleGroup(e.target.value)}
                className="sr-only"
              />
              {g.label}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!canSubmit} className="flex-1">
          {saving ? 'Guardando…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
