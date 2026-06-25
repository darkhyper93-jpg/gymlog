import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Exercise, WorkoutSet } from '../types';
import { useRegister } from '../hooks/useRegister';
import { muscleGroupLabel } from '../muscleGroups';
import { Button, Card, Chip, NumberField, SectionLabel, Spinner, StateView } from './ui';
import { AlertTriangleIcon, CheckCircleIcon, PencilIcon, PlusIcon, TargetIcon, TrashIcon } from './icons';
import { RestTimer } from './RestTimer';
import { Toast } from './Toast';

// Pantalla "registrar hoy": el corazón del V1. Muestra objetivo + última vez para superar,
// y deja cargar series rápido (pocos toques, prefill inteligente, alta optimista).
export function RegisterScreen({ exercise }: { exercise: Exercise }) {
  const { status, error, todaySets, reference, reload, addSet, removeSet, editSet } = useRegister(exercise.id);
  const [timerSecs, setTimerSecs] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleAddSet = useCallback(
    async (input: { weight: number; reps: number; rir?: number; date?: string; note?: string }) => {
      const { weightPR, oneRmPR, achievements } = await addSet(input);
      if (exercise.restSeconds != null && exercise.restSeconds > 0) {
        setTimerSecs(exercise.restSeconds);
      }
      // Prioridad: logro nuevo > PR de 1RM > PR de peso.
      if (achievements.length > 0) {
        setToast(`Logro: ${achievements[0].title}`);
      } else if (oneRmPR) {
        setToast('¡Nuevo récord de 1RM estimado!');
      } else if (weightPR) {
        setToast('¡Nuevo récord de peso!');
      }
    },
    [addSet, exercise.restSeconds],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h2 className="text-3xl font-bold tracking-tight text-fg">{exercise.name}</h2>
        <div className="flex flex-wrap gap-2">
          {exercise.target ? (
            <Chip icon={<TargetIcon className="h-4 w-4" />}>{exercise.target}</Chip>
          ) : (
            <p className="text-sm text-muted/70">Sin objetivo definido</p>
          )}
          {exercise.muscleGroup && <Chip tone="neutral">{muscleGroupLabel(exercise.muscleGroup)}</Chip>}
        </div>
      </header>

      {status === 'loading' && <Spinner />}

      {status === 'error' && (
        <StateView
          icon={<AlertTriangleIcon className="h-10 w-10 text-danger" />}
          title="No se pudo cargar el historial"
          subtitle={error ?? undefined}
          action={
            <Button variant="ghost" onClick={() => void reload()}>
              Reintentar
            </Button>
          }
        />
      )}

      {status === 'ready' && (
        <>
          <ReferencePanel reference={reference} />

          <section className="flex flex-col gap-3">
            <SectionLabel>Hoy</SectionLabel>
            {todaySets.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                {reference
                  ? 'Todavía no cargaste series hoy. Agregá la primera para superar la última vez.'
                  : 'Primera vez con este ejercicio. ¡Arrancá cargando tu primera serie!'}
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {todaySets.map((s, i) => (
                  <SetRow key={s.id} index={i + 1} set={s} onDelete={removeSet} onEdit={editSet} />
                ))}
              </ol>
            )}
          </section>

          <Card className="flex flex-col gap-4 border-brand/30">
            <SectionLabel>Nueva serie</SectionLabel>
            <SetForm prefill={pickPrefill(todaySets, reference?.sets ?? [])} onAdd={handleAddSet} />
          </Card>
        </>
      )}
      {timerSecs !== null && (
        <RestTimer initialSeconds={timerSecs} onClose={() => setTimerSecs(null)} />
      )}
      {toast !== null && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function ReferencePanel({ reference }: { reference: { date: string; sets: WorkoutSet[] } | null }) {
  if (!reference) {
    return (
      <Card className="border-dashed bg-surface-2 text-center shadow-none">
        <p className="text-sm text-muted">Sin historial previo: hoy marcás el punto de partida.</p>
      </Card>
    );
  }
  return (
    <Card className="bg-surface-2 shadow-none">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <SectionLabel>Última vez</SectionLabel>
        <span className="text-xs text-muted">{formatDate(reference.date)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {[...reference.sets].reverse().map((s) => (
          <span
            key={s.id}
            className="tabular rounded-lg border border-border/50 bg-surface-lowest px-2.5 py-1.5 text-sm text-fg"
          >
            <SetText set={s} />
          </span>
        ))}
      </div>
    </Card>
  );
}

function SetRow({
  index,
  set,
  onDelete,
  onEdit,
}: {
  index: number;
  set: WorkoutSet;
  onDelete: (id: string) => Promise<void>;
  onEdit: (id: string, input: { weight?: number; reps?: number; rir?: number | null; note?: string | null }) => Promise<void>;
}) {
  const pending = set.id.startsWith('temp-');
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editWeight, setEditWeight] = useState(String(set.weight));
  const [editReps, setEditReps] = useState(String(set.reps));
  const [editRir, setEditRir] = useState(set.rir == null ? '' : String(set.rir));
  const [editNote, setEditNote] = useState(set.note ?? '');
  const [showEditNote, setShowEditNote] = useState(set.note != null && set.note !== '');

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(set.id);
    } catch {
      setDeleting(false);
    }
  }

  function startEdit() {
    setEditWeight(String(set.weight));
    setEditReps(String(set.reps));
    setEditRir(set.rir == null ? '' : String(set.rir));
    setEditNote(set.note ?? '');
    setShowEditNote(set.note != null && set.note !== '');
    setEditing(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const w = Number(editWeight);
    const r = Number(editReps);
    if (!editWeight || !editReps || !Number.isFinite(w) || w < 0 || !Number.isInteger(r) || r <= 0) return;
    setSaving(true);
    try {
      await onEdit(set.id, {
        weight: w,
        reps: r,
        rir: editRir === '' ? null : Number(editRir),
        note: editNote.trim() || null,
      });
      setEditing(false);
    } catch {
      // error queda en el servidor; el optimismo ya hizo rollback en el hook
    } finally {
      setSaving(false);
    }
  }

  const busy = pending || deleting || saving;

  if (editing) {
    return (
      <li className="flex flex-col gap-3 rounded-xl border border-brand/40 bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand tabular">
            {index}
          </span>
          <span className="text-sm font-medium text-muted">Editando serie</span>
        </div>
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <NumberField label="Peso (kg)" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} placeholder="0" />
            <NumberField label="Reps" value={editReps} onChange={(e) => setEditReps(e.target.value)} placeholder="0" />
            <NumberField label="RIR" value={editRir} onChange={(e) => setEditRir(e.target.value)} placeholder="—" />
          </div>
          {showEditNote ? (
            <textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Nota opcional…"
              maxLength={500}
              rows={2}
              className="resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-brand focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowEditNote(true)}
              className="self-start text-sm text-muted underline-offset-2 hover:text-brand hover:underline"
            >
              + Agregar nota
            </button>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving} className="flex-1">
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      className={`flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3
        ${busy ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft
            text-sm font-bold text-brand tabular"
        >
          {index}
        </span>
        <span className="tabular flex-1 text-base font-semibold text-fg">
          <SetText set={set} />
        </span>
        {busy ? (
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-border border-t-brand" />
        ) : (
          <>
            <CheckCircleIcon className="h-5 w-5 shrink-0 text-brand" />
            <button
              type="button"
              onClick={startEdit}
              aria-label="Editar serie"
              className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-brand/10 hover:text-brand"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              aria-label="Borrar serie"
              className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      {set.note && (
        <p className="ml-12 text-xs text-muted italic">{set.note}</p>
      )}
    </li>
  );
}

function SetText({ set }: { set: WorkoutSet }) {
  return (
    <>
      {set.weight} kg × {set.reps}
      {set.rir != null && <span className="ml-1.5 font-medium text-accent">— RIR {set.rir}</span>}
    </>
  );
}

// Devuelve 'YYYY-MM-DD' en el timezone del dispositivo (que debe ser Uruguay).
function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function SetForm({
  prefill,
  onAdd,
}: {
  prefill: { weight: string; reps: string; rir: string };
  onAdd: (input: { weight: number; reps: number; rir?: number; date?: string; note?: string }) => Promise<void>;
}) {
  const [weight, setWeight] = useState(prefill.weight);
  const [reps, setReps] = useState(prefill.reps);
  const [rir, setRir] = useState(prefill.rir);
  const today = useMemo(() => todayLocalStr(), []);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = useMemo(() => {
    const w = Number(weight);
    const r = Number(reps);
    return weight !== '' && reps !== '' && Number.isFinite(w) && w >= 0 && Number.isInteger(r) && r > 0;
  }, [weight, reps]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({
        weight: Number(weight),
        reps: Number(reps),
        rir: rir === '' ? undefined : Number(rir),
        // Si la fecha no es hoy, enviamos mediodía en hora Uruguay para que el backend
        // la agrupe correctamente (UTC-3 fijo, sin DST).
        date: date !== today ? `${date}T12:00:00.000-03:00` : undefined,
        note: note.trim() || undefined,
      });
      // Dejo los valores cargados como prefill de la próxima serie (para superar/repetir rápido).
      // Resetear solo nota y fecha; peso/reps/rir se quedan para encadenar.
      setNote('');
      setShowNote(false);
      setDate(today);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la serie');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex gap-2">
        <NumberField
          label="Peso (kg)"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="0"
        />
        <NumberField
          label="Reps"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="0"
        />
        <NumberField
          label="RIR"
          value={rir}
          onChange={(e) => setRir(e.target.value)}
          placeholder="—"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">Fecha</label>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
        />
      </div>
      {showNote ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Nota (opcional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: Fallo técnico en última rep, hombro cargado…"
            maxLength={500}
            rows={2}
            className="resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-brand focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          className="self-start text-sm text-muted underline-offset-2 hover:text-brand hover:underline"
        >
          + Agregar nota
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={!valid || saving}>
        <PlusIcon className="h-5 w-5" />
        {saving ? 'Guardando…' : 'Agregar serie'}
      </Button>
    </form>
  );
}

function pickPrefill(
  todaySets: WorkoutSet[],
  refSets: WorkoutSet[],
): { weight: string; reps: string; rir: string } {
  const base = todaySets.length > 0 ? todaySets[todaySets.length - 1] : refSets[0];
  if (!base) return { weight: '', reps: '', rir: '' };
  return {
    weight: String(base.weight),
    reps: String(base.reps),
    rir: base.rir == null ? '' : String(base.rir),
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
