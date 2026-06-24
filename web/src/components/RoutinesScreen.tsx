import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Exercise, Routine, RoutineDay, RoutineDayExercise } from '../types';
import { useRoutines } from '../hooks/useRoutines';
import { useExercises } from '../hooks/useExercises';
import { muscleGroupLabel, MUSCLE_GROUPS } from '../muscleGroups';
import { Button, Card, IconButton, Modal, Spinner, StateView, TextInput } from './ui';
import {
  AlertTriangleIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DumbbellIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from './icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'create-routine' }
  | { type: 'edit-routine'; routine: Routine }
  | { type: 'add-day'; routineId: string }
  | { type: 'edit-day'; routineId: string; day: RoutineDay }
  | { type: 'add-exercise'; routineId: string; dayId: string }
  | null;

// ─── NameModal ────────────────────────────────────────────────────────────────

function NameModal({
  title,
  initialName = '',
  onSubmit,
  onClose,
}: {
  title: string;
  initialName?: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : 'Error al guardar');
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextInput
          autoFocus
          placeholder="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {err && <p className="text-sm text-danger">{err}</p>}
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </Modal>
  );
}

// ─── ExerciseSelectorModal ────────────────────────────────────────────────────

const OTHERS_KEY = '__otros__';

function ExerciseSelectorModal({
  onSelect,
  onClose,
}: {
  onSelect: (exercise: Exercise) => Promise<void>;
  onClose: () => void;
}) {
  const { exercises, status } = useExercises();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? exercises.filter((e) => e.name.toLowerCase().includes(q)) : exercises;
  }, [exercises, query]);

  const sections = useMemo(() => {
    const byKey = new Map<string, Exercise[]>();
    for (const ex of filtered) {
      const key = ex.muscleGroup ?? OTHERS_KEY;
      const bucket = byKey.get(key);
      if (bucket) bucket.push(ex);
      else byKey.set(key, [ex]);
    }
    const result: { key: string; label: string; items: Exercise[] }[] = [];
    for (const g of MUSCLE_GROUPS) {
      const items = byKey.get(g.key);
      if (items?.length) result.push({ key: g.key, label: g.label, items });
    }
    const others = byKey.get(OTHERS_KEY);
    if (others?.length) result.push({ key: OTHERS_KEY, label: 'Otros', items: others });
    return result;
  }, [filtered]);

  async function handleSelect(ex: Exercise) {
    setBusy(ex.id);
    try {
      await onSelect(ex);
      onClose();
    } catch {
      setBusy(null);
    }
  }

  return (
    <Modal title="Agregar ejercicio" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <TextInput
          autoFocus
          placeholder="Buscar ejercicio…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {status === 'loading' && <Spinner />}
        {status === 'ready' && sections.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">No hay ejercicios</p>
        )}
        <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.key}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                {section.label}
              </p>
              <div className="flex flex-col gap-1">
                {section.items.map((ex) => (
                  <button
                    key={ex.id}
                    disabled={busy === ex.id}
                    onClick={() => handleSelect(ex)}
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent
                      bg-surface-2 px-4 py-3 text-left transition-colors
                      hover:border-brand hover:bg-brand-soft
                      active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  >
                    <DumbbellIcon className="h-4 w-4 shrink-0 text-muted" />
                    <span className="flex-1 truncate text-sm font-medium text-fg">{ex.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {muscleGroupLabel(ex.muscleGroup)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─── ExerciseRow ──────────────────────────────────────────────────────────────

function ExerciseRow({
  item,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  onRegister,
}: {
  item: RoutineDayExercise;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onRegister: (ex: Exercise) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2.5">
      {/* Reorder */}
      <div className="flex flex-col gap-0.5">
        <button
          disabled={isFirst}
          onClick={onMoveUp}
          aria-label="Subir ejercicio"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors
            hover:bg-surface-2 hover:text-fg disabled:opacity-25"
        >
          <ChevronUpIcon className="h-3.5 w-3.5" />
        </button>
        <button
          disabled={isLast}
          onClick={onMoveDown}
          aria-label="Bajar ejercicio"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors
            hover:bg-surface-2 hover:text-fg disabled:opacity-25"
        >
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Name + group */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold leading-tight text-fg">
          {item.exercise.name}
        </span>
        <span className="text-xs text-muted">{muscleGroupLabel(item.exercise.muscleGroup)}</span>
      </div>
      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => onRegister(item.exercise)}
          className="whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs
            font-semibold text-muted transition-colors hover:border-brand hover:text-brand"
        >
          Registrar hoy
        </button>
        <button
          onClick={onRemove}
          aria-label="Quitar ejercicio"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors
            hover:bg-danger/10 hover:text-danger"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── DaySection ───────────────────────────────────────────────────────────────

function DaySection({
  day,
  routineId,
  isFirst,
  isLast,
  hook,
  onOpenAddExercise,
  onOpenEditDay,
  onRegister,
}: {
  day: RoutineDay;
  routineId: string;
  isFirst: boolean;
  isLast: boolean;
  hook: ReturnType<typeof useRoutines>;
  onOpenAddExercise: () => void;
  onOpenEditDay: () => void;
  onRegister: (ex: Exercise) => void;
}) {
  const sorted = useMemo(
    () => [...day.exercises].sort((a, b) => a.order - b.order),
    [day.exercises],
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-lowest p-3">
      {/* Day header */}
      <div className="flex items-center gap-1">
        <div className="flex flex-col gap-0.5">
          <button
            disabled={isFirst}
            onClick={() => hook.moveDayUp(routineId, day.id)}
            aria-label="Subir día"
            className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors
              hover:text-fg disabled:opacity-25"
          >
            <ChevronUpIcon className="h-3 w-3" />
          </button>
          <button
            disabled={isLast}
            onClick={() => hook.moveDayDown(routineId, day.id)}
            aria-label="Bajar día"
            className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors
              hover:text-fg disabled:opacity-25"
          >
            <ChevronDownIcon className="h-3 w-3" />
          </button>
        </div>
        <span className="flex-1 text-sm font-semibold text-fg">{day.name}</span>
        <IconButton aria-label="Editar día" onClick={onOpenEditDay} className="h-8 w-8">
          <PencilIcon className="h-3.5 w-3.5" />
        </IconButton>
        <button
          aria-label="Eliminar día"
          onClick={() => hook.removeDay(routineId, day.id)}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors
            hover:bg-danger/10 hover:text-danger"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Exercises list */}
      {sorted.length === 0 ? (
        <p className="py-1.5 text-center text-xs text-muted">Sin ejercicios todavía</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sorted.map((item, idx) => (
            <ExerciseRow
              key={item.id}
              item={item}
              isFirst={idx === 0}
              isLast={idx === sorted.length - 1}
              onMoveUp={() => hook.moveExerciseUp(routineId, day.id, item.id)}
              onMoveDown={() => hook.moveExerciseDown(routineId, day.id, item.id)}
              onRemove={() => hook.removeExercise(routineId, day.id, item.id)}
              onRegister={onRegister}
            />
          ))}
        </div>
      )}

      {/* Add exercise */}
      <button
        onClick={onOpenAddExercise}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed
          border-border py-2 text-xs font-semibold text-muted transition-colors
          hover:border-brand hover:text-brand"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Agregar ejercicio
      </button>
    </div>
  );
}

// ─── RoutineCard ──────────────────────────────────────────────────────────────

function RoutineCard({
  routine,
  isExpanded,
  onToggle,
  hook,
  onOpenModal,
  onRegister,
}: {
  routine: Routine;
  isExpanded: boolean;
  onToggle: () => void;
  hook: ReturnType<typeof useRoutines>;
  onOpenModal: (state: ModalState) => void;
  onRegister: (ex: Exercise) => void;
}) {
  const sortedDays = useMemo(
    () => [...routine.days].sort((a, b) => a.order - b.order),
    [routine.days],
  );

  return (
    <Card className="overflow-hidden p-0">
      {/* Routine header row */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <CalendarIcon className="h-5 w-5 shrink-0 text-brand" />
          <span className="flex-1 text-base font-semibold text-fg">{routine.name}</span>
          {isExpanded ? (
            <ChevronUpIcon className="h-4 w-4 text-muted" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-muted" />
          )}
        </button>
        <IconButton
          aria-label="Editar rutina"
          onClick={() => onOpenModal({ type: 'edit-routine', routine })}
          className="h-9 w-9 shrink-0"
        >
          <PencilIcon className="h-4 w-4" />
        </IconButton>
        <button
          aria-label="Eliminar rutina"
          onClick={() => hook.removeRoutine(routine.id)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted
            transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div className="flex flex-col gap-2 border-t border-border px-4 pb-4 pt-3">
          {sortedDays.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted">Sin días todavía</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedDays.map((day, idx) => (
                <DaySection
                  key={day.id}
                  day={day}
                  routineId={routine.id}
                  isFirst={idx === 0}
                  isLast={idx === sortedDays.length - 1}
                  hook={hook}
                  onOpenAddExercise={() =>
                    onOpenModal({ type: 'add-exercise', routineId: routine.id, dayId: day.id })
                  }
                  onOpenEditDay={() =>
                    onOpenModal({ type: 'edit-day', routineId: routine.id, day })
                  }
                  onRegister={onRegister}
                />
              ))}
            </div>
          )}
          <button
            onClick={() => onOpenModal({ type: 'add-day', routineId: routine.id })}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed
              border-border py-3 text-sm font-semibold text-muted transition-colors
              hover:border-brand hover:text-brand"
          >
            <PlusIcon className="h-4 w-4" />
            Agregar día
          </button>
        </div>
      )}
    </Card>
  );
}

// ─── RoutinesScreen ───────────────────────────────────────────────────────────

export function RoutinesScreen({ onRegister }: { onRegister: (ex: Exercise) => void }) {
  const hook = useRoutines();
  const { routines, status, error, reload } = hook;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  function closeModal() {
    setModal(null);
  }

  if (status === 'loading') return <Spinner />;

  if (status === 'error') {
    return (
      <StateView
        icon={<AlertTriangleIcon className="h-12 w-12" />}
        title="Error al cargar rutinas"
        subtitle={error ?? undefined}
        action={
          <Button variant="secondary" onClick={reload}>
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button
        onClick={() => setModal({ type: 'create-routine' })}
        className="w-full md:ml-auto md:w-auto"
      >
        <PlusIcon className="h-5 w-5" />
        Nueva rutina
      </Button>

      {routines.length === 0 ? (
        <StateView
          icon={<CalendarIcon className="h-12 w-12" />}
          title="Sin rutinas"
          subtitle="Armá tu primera rutina con días y ejercicios."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              isExpanded={expandedId === routine.id}
              onToggle={() => setExpandedId((prev) => (prev === routine.id ? null : routine.id))}
              hook={hook}
              onOpenModal={setModal}
              onRegister={onRegister}
            />
          ))}
        </div>
      )}

      {/* ─── Modals ─── */}
      {modal !== null && modal.type === 'create-routine' && (
        <NameModal
          title="Nueva rutina"
          onSubmit={async (name) => {
            const created = await hook.addRoutine(name);
            setExpandedId(created.id);
          }}
          onClose={closeModal}
        />
      )}
      {modal !== null && modal.type === 'edit-routine' && (
        <NameModal
          title="Renombrar rutina"
          initialName={modal.routine.name}
          onSubmit={(name) => hook.editRoutine(modal.routine.id, name)}
          onClose={closeModal}
        />
      )}
      {modal !== null && modal.type === 'add-day' && (
        <NameModal
          title="Nuevo día"
          onSubmit={async (name) => {
            await hook.addDay(modal.routineId, name);
          }}
          onClose={closeModal}
        />
      )}
      {modal !== null && modal.type === 'edit-day' && (
        <NameModal
          title="Renombrar día"
          initialName={modal.day.name}
          onSubmit={(name) => hook.editDay(modal.routineId, modal.day.id, name)}
          onClose={closeModal}
        />
      )}
      {modal !== null && modal.type === 'add-exercise' && (
        <ExerciseSelectorModal
          onSelect={async (ex) => {
            await hook.addExercise(modal.routineId, modal.dayId, ex.id);
          }}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
