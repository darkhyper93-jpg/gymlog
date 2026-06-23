import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Select, TextInput } from './ui';
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
      <TextInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del ejercicio"
        aria-label="Nombre del ejercicio"
        autoFocus={!!initial}
      />
      <Select
        label="Grupo muscular"
        value={muscleGroup}
        onChange={(e) => setMuscleGroup(e.target.value)}
        aria-label="Grupo muscular"
      >
        <option value="" disabled>
          Elegí una sección…
        </option>
        {MUSCLE_GROUPS.map((g) => (
          <option key={g.key} value={g.key}>
            {g.label}
          </option>
        ))}
      </Select>
      <TextInput
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="Objetivo (ej. 4x8-10 RIR2)"
        aria-label="Objetivo"
      />
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
