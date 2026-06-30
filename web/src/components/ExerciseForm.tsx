import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, TextInput } from './ui';
import { XIcon, PlusIcon } from './icons';
import { MUSCLE_GROUPS } from '../muscleGroups';
import type { MuscleGroup } from '../types';

// Formulario reusado para crear y editar. onSubmit hace el await; el form maneja su propio
// estado de guardado y de error (para no dejar la pantalla muda si la API falla).
// El ejercicio es solo nombre + grupo muscular: el plan (objetivo/descanso) vive en el
// ítem de rutina, no acá.
export function ExerciseForm({
  initial,
  submitLabel,
  customGroups,
  onCreateGroup,
  onDeleteGroup,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; muscleGroup: string };
  submitLabel: string;
  customGroups: MuscleGroup[];
  onCreateGroup: (name: string) => Promise<MuscleGroup>;
  onDeleteGroup: (id: string) => Promise<void>;
  onSubmit: (input: { name: string; muscleGroup: string }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [muscleGroup, setMuscleGroup] = useState(initial?.muscleGroup ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupError, setGroupError] = useState<string | null>(null);

  const canSubmit = name.trim() !== '' && muscleGroup !== '' && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), muscleGroup });
      if (!initial) {
        // Modo "crear": limpiar para cargar el siguiente rápido.
        setName('');
        setMuscleGroup('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateGroup() {
    const trimmed = newGroupName.trim();
    if (trimmed === '') return;
    setGroupError(null);
    try {
      const created = await onCreateGroup(trimmed);
      setMuscleGroup(created.name);
      setNewGroupName('');
      setCreatingGroup(false);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'No se pudo crear el grupo');
    }
  }

  async function handleDeleteGroup(group: MuscleGroup) {
    if (!confirm(`Esto manda los ejercicios de "${group.name}" a "Otros". ¿Borrar el grupo?`)) return;
    try {
      await onDeleteGroup(group.id);
      if (muscleGroup === group.name) setMuscleGroup('');
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'No se pudo borrar el grupo');
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
          {customGroups.map((g) => (
            <div
              key={g.id}
              className="relative flex cursor-pointer items-center justify-center rounded-lg border border-border
                bg-surface-lowest px-3 py-3 text-sm font-medium text-fg transition-all
                hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-brand/10
                has-[:checked]:text-brand"
            >
              <label className="flex w-full cursor-pointer items-center justify-center">
                <input
                  type="radio"
                  name="muscleGroup"
                  value={g.name}
                  checked={muscleGroup === g.name}
                  onChange={(e) => setMuscleGroup(e.target.value)}
                  className="sr-only"
                />
                <span className="truncate">{g.name}</span>
              </label>
              <button
                type="button"
                aria-label={`Borrar grupo ${g.name}`}
                onClick={() => void handleDeleteGroup(g)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center
                  rounded-full bg-surface-2 text-muted hover:bg-danger/10 hover:text-danger"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {creatingGroup ? (
          <div className="mt-2 flex gap-2">
            <TextInput
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Nombre del grupo"
              aria-label="Nombre del nuevo grupo muscular"
              autoFocus
              maxLength={30}
            />
            <Button type="button" onClick={() => void handleCreateGroup()}>
              Crear
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCreatingGroup(false);
                setNewGroupName('');
                setGroupError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingGroup(true)}
            className="mt-2 flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border
              border-dashed border-border px-3 py-2 text-sm font-medium text-muted
              transition-colors hover:border-brand hover:text-brand"
          >
            <PlusIcon className="h-4 w-4" />
            Crear grupo
          </button>
        )}
        {groupError && <p className="text-sm text-danger">{groupError}</p>}
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
