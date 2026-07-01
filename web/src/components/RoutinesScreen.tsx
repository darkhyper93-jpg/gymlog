import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Exercise, Routine, RoutineDay, RoutineDayExercise, WorkoutSet } from '../types';
import { useRoutines } from '../hooks/useRoutines';
import { useExercises } from '../hooks/useExercises';
import { useTodaySets } from '../hooks/useTodaySets';
import { muscleGroupLabel, MUSCLE_GROUPS } from '../muscleGroups';
import { Button, Card, IconButton, Modal, NumberField, Spinner, StateView, TextInput } from './ui';
import { ImportRoutineModal } from './ImportRoutineModal';
import {
  AlertTriangleIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DumbbellIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from './icons';
import type { ItemPlanPatch } from '../api/routines';
import type { DragEndEvent } from '@dnd-kit/core';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { todayKeyMVD } from '../time';

// ─── Días de la semana ────────────────────────────────────────────────────────

const WEEKDAY_PRESETS = ['Lun', 'Mar', 'Mier', 'Jue', 'Vie', 'Sab', 'Dom'];

// Devuelve la abreviatura del día de hoy en hora de Uruguay.
function todayWeekdayMVD(): string {
  const en = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Montevideo',
    weekday: 'short',
  }).format(new Date());
  const map: Record<string, string> = {
    Sun: 'Dom', Mon: 'Lun', Tue: 'Mar', Wed: 'Mier', Thu: 'Jue', Fri: 'Vie', Sat: 'Sab',
  };
  return map[en] ?? '';
}

// Coincidencia flexible: "Jue", "Jueves" y "jue" matchean el mismo día.
function matchesToday(dayName: string, todayAbbr: string): boolean {
  if (!todayAbbr) return false;
  const n = dayName.trim().toLowerCase();
  const t = todayAbbr.toLowerCase();
  return n === t || n.startsWith(t);
}

// ─── Selección "qué entrenás hoy" ────────────────────────────────────────────

type TodaySelection = { dayIds: string[] };

const TODAY_SESSION_PREFIX = 'today-session-';

function loadTodaySelection(): TodaySelection | null {
  try {
    const raw = localStorage.getItem(TODAY_SESSION_PREFIX + todayKeyMVD());
    if (!raw) return null;
    return JSON.parse(raw) as TodaySelection;
  } catch {
    return null;
  }
}

function saveTodaySelection(sel: TodaySelection | null) {
  const key = TODAY_SESSION_PREFIX + todayKeyMVD();
  // Limpiar selecciones de días anteriores: se acumulaba una clave por día sin borrarse nunca.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(TODAY_SESSION_PREFIX) && k !== key) localStorage.removeItem(k);
  }
  if (sel === null || sel.dayIds.length === 0) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(sel));
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'create-routine' }
  | { type: 'edit-routine'; routine: Routine }
  | { type: 'add-day'; routineId: string }
  | { type: 'edit-day'; routineId: string; day: RoutineDay }
  | { type: 'add-exercise'; routineId: string; dayId: string }
  | { type: 'edit-item-plan'; routineId: string; dayId: string; item: RoutineDayExercise }
  | { type: 'today-session' }
  | { type: 'import' }
  | null;

// ─── NameModal ────────────────────────────────────────────────────────────────

function NameModal({
  title,
  initialName = '',
  presets,
  onSubmit,
  onClose,
}: {
  title: string;
  initialName?: string;
  presets?: string[];
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
        {presets && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setName(p)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  name === p
                    ? 'bg-brand text-white'
                    : 'bg-surface-2 text-muted hover:bg-brand-soft hover:text-brand'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <TextInput
          placeholder="Nombre personalizado"
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

// ─── ItemPlanModal ────────────────────────────────────────────────────────────

function ItemPlanModal({
  item,
  onSubmit,
  onClose,
}: {
  item: RoutineDayExercise;
  onSubmit: (patch: ItemPlanPatch) => Promise<void>;
  onClose: () => void;
}) {
  const [plannedSets, setPlannedSets] = useState(
    item.plannedSets != null ? String(item.plannedSets) : '',
  );
  const [plannedReps, setPlannedReps] = useState(item.plannedReps ?? '');
  const [plannedRir, setPlannedRir] = useState(item.plannedRir ?? '');
  const [restSeconds, setRestSeconds] = useState(
    item.restSeconds != null ? String(item.restSeconds) : '',
  );
  const [note, setNote] = useState(item.note ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({
        plannedSets: plannedSets.trim() === '' ? null : Number(plannedSets),
        plannedReps: plannedReps.trim() === '' ? null : plannedReps.trim(),
        plannedRir: plannedRir.trim() === '' ? null : plannedRir.trim(),
        restSeconds: restSeconds.trim() === '' ? null : Number(restSeconds),
        note: note.trim() === '' ? null : note.trim(),
      });
      onClose();
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : 'Error al guardar');
      setSaving(false);
    }
  }

  return (
    <Modal title={`Plan: ${item.exercise.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-2">
          <NumberField
            label="Series"
            value={plannedSets}
            onChange={(e) => setPlannedSets(e.target.value)}
            placeholder="—"
          />
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-muted">Reps</label>
            <TextInput
              value={plannedReps}
              onChange={(e) => setPlannedReps(e.target.value)}
              placeholder="ej: 8-10"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-muted">RIR</label>
            <TextInput
              value={plannedRir}
              onChange={(e) => setPlannedRir(e.target.value)}
              placeholder="ej: 2"
            />
          </div>
        </div>
        <NumberField
          label="Descanso (segundos)"
          value={restSeconds}
          onChange={(e) => setRestSeconds(e.target.value)}
          placeholder="—"
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Nota</label>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota opcional…"
          />
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </Modal>
  );
}

// ─── TodaySessionModal ────────────────────────────────────────────────────────

function TodaySessionModal({
  routines,
  currentSelection,
  onSave,
  onClose,
  onCreateRoutine,
}: {
  routines: Routine[];
  currentSelection: TodaySelection | null;
  onSave: (sel: TodaySelection | null) => void;
  onClose: () => void;
  onCreateRoutine: () => void;
}) {
  const [selectedDayIds, setSelectedDayIds] = useState<Set<string>>(
    new Set(currentSelection?.dayIds ?? []),
  );

  function toggleDay(dayId: string) {
    setSelectedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }

  function handleSave() {
    const dayIds = Array.from(selectedDayIds);
    onSave(dayIds.length > 0 ? { dayIds } : null);
    onClose();
  }

  return (
    <Modal title="¿Qué entrenás hoy?" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {routines.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CalendarIcon className="h-10 w-10 text-muted" />
            <p className="text-sm text-muted">No tenés rutinas. Creá una primero.</p>
            <Button onClick={onCreateRoutine} variant="secondary">
              <PlusIcon className="h-4 w-4" />
              Crear rutina
            </Button>
          </div>
        ) : (
          <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
            {routines.map((routine) => {
              const sorted = [...routine.days].sort((a, b) => a.order - b.order);
              return (
                <div key={routine.id}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                    {routine.name}
                  </p>
                  <div className="flex flex-col gap-1">
                    {sorted.map((day) => (
                      <label
                        key={day.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                          selectedDayIds.has(day.id)
                            ? 'border-brand bg-brand-soft/20 text-brand'
                            : 'border-border bg-surface text-fg hover:border-brand/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDayIds.has(day.id)}
                          onChange={() => toggleDay(day.id)}
                          className="h-4 w-4 accent-brand"
                        />
                        <span className="text-sm font-medium">{day.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSave} className="flex-1">
            Guardar selección
          </Button>
          {currentSelection !== null && (
            <Button
              variant="ghost"
              onClick={() => { onSave(null); onClose(); }}
              className="flex-1"
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>
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

// Formatea el resumen del plan importado (sets×reps · RIR · Xs) para mostrar en la fila.
function formatPlanned(item: RoutineDayExercise): string | null {
  const parts: string[] = [];
  if (item.plannedSets != null || item.plannedReps != null) {
    const s = item.plannedSets != null ? String(item.plannedSets) : '?';
    const r = item.plannedReps ?? '?';
    parts.push(`${s}×${r}`);
  }
  if (item.plannedRir != null) parts.push(`RIR ${item.plannedRir}`);
  if (item.restSeconds != null) {
    parts.push(item.restSeconds >= 60 ? `${Math.round(item.restSeconds / 60)}min` : `${item.restSeconds}s`);
  }
  if (item.note) parts.push(item.note);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function TodayStatus({ sets }: { sets: WorkoutSet[] | undefined }) {
  if (sets === undefined) return null; // cargando, no mostrar nada
  if (sets.length === 0) {
    return <span className="text-xs text-muted/60">— sin series hoy</span>;
  }
  const summary = sets.map((s) => `${s.weight}×${s.reps}`).join(', ');
  return (
    <span className="text-xs font-medium text-brand">
      ✓ {sets.length} {sets.length === 1 ? 'serie' : 'series'} hoy: {summary}
    </span>
  );
}

function ExerciseRow({
  item,
  todaySets,
  onRemove,
  onRegister,
  onEditPlan,
}: {
  item: RoutineDayExercise;
  todaySets: WorkoutSet[] | undefined;
  onRemove: () => void;
  onRegister: (ex: Exercise, plannedRestSeconds?: number | null) => void;
  onEditPlan: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2.5 ${
        isDragging ? 'z-50 opacity-50 shadow-lg' : ''
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        aria-label="Arrastrar ejercicio"
        className="flex h-7 w-7 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg
          text-muted transition-colors hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
      >
        <GripVerticalIcon className="h-4 w-4" />
      </button>
      {/* Name + group + target + today status */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold leading-tight text-fg">
          {item.exercise.name}
        </span>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0">
          <span className="text-xs text-muted">{muscleGroupLabel(item.exercise.muscleGroup)}</span>
        </div>
        {formatPlanned(item) && (
          <span className="text-xs font-medium text-brand/80">{formatPlanned(item)}</span>
        )}
        <TodayStatus sets={todaySets} />
      </div>
      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => onRegister(item.exercise, item.restSeconds)}
          className="whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs
            font-semibold text-muted transition-colors hover:border-brand hover:text-brand"
        >
          Registrar
        </button>
        <IconButton aria-label="Editar plan" onClick={onEditPlan} className="h-8 w-8">
          <PencilIcon className="h-3.5 w-3.5" />
        </IconButton>
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
  hook,
  byExercise,
  todayAbbr,
  todaySelection,
  onOpenAddExercise,
  onOpenEditDay,
  onRegister,
  onOpenModal,
}: {
  day: RoutineDay;
  routineId: string;
  hook: ReturnType<typeof useRoutines>;
  byExercise: Map<string, WorkoutSet[]> | null;
  todayAbbr: string;
  todaySelection: TodaySelection | null;
  onOpenAddExercise: () => void;
  onOpenEditDay: () => void;
  onRegister: (ex: Exercise, plannedRestSeconds?: number | null) => void;
  onOpenModal: (state: ModalState) => void;
}) {
  // Si hay selección manual, esa manda; si no, match por nombre de día.
  const isToday = todaySelection !== null
    ? todaySelection.dayIds.includes(day.id)
    : matchesToday(day.name, todayAbbr);
  const [open, setOpen] = useState(isToday);

  // Abrir el día cuando se convierte en "hoy" (ej. selección manual), sin forzar el cierre.
  useEffect(() => {
    if (isToday) setOpen(true);
  }, [isToday]);

  // Sortable para el drag de días (DndContext padre en RoutineCard)
  const {
    attributes: dayAttributes,
    listeners: dayListeners,
    setNodeRef: setDayNodeRef,
    transform: dayTransform,
    transition: dayTransition,
    isDragging: isDayDragging,
  } = useSortable({ id: day.id });

  const [localItems, setLocalItems] = useState<RoutineDayExercise[]>(() =>
    [...day.exercises].sort((a, b) => a.order - b.order),
  );
  useEffect(() => {
    setLocalItems([...day.exercises].sort((a, b) => a.order - b.order));
  }, [day.exercises]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const dayProgress = useMemo(() => {
    if (!isToday || !byExercise || localItems.length === 0) return null;
    const done = localItems.filter(
      (item) => (byExercise.get(item.exerciseId)?.length ?? 0) > 0,
    ).length;
    return { done, total: localItems.length };
  }, [isToday, byExercise, localItems]);

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setLocalItems((curr) => {
      const oldIdx = curr.findIndex((i) => i.id === active.id);
      const newIdx = curr.findIndex((i) => i.id === over.id);
      const next = arrayMove(curr, oldIdx, newIdx);
      void hook.reorderExercises(routineId, day.id, next.map((i) => i.id));
      return next;
    });
  }

  const dayStyle = {
    transform: CSS.Transform.toString(dayTransform),
    transition: dayTransition,
  };

  return (
    <div
      ref={setDayNodeRef}
      style={dayStyle}
      className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors ${
        isDayDragging ? 'z-50 opacity-50 shadow-lg' : ''
      } ${
        isToday
          ? 'border-brand/50 bg-brand-soft/20'
          : 'border-border/60 bg-surface-lowest'
      }`}
    >
      {/* Day header */}
      <div className="flex items-center gap-1">
        {/* Drag handle de día — separado del botón de plegar para no solaparse */}
        <button
          {...dayAttributes}
          {...dayListeners}
          aria-label="Arrastrar día"
          className="flex h-8 w-7 shrink-0 touch-none cursor-grab items-center justify-center
            rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg
            active:cursor-grabbing"
        >
          <GripVerticalIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span className={`text-sm font-semibold ${isToday ? 'text-brand' : 'text-fg'}`}>
            {day.name}
          </span>
          {isToday && (
            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              hoy
            </span>
          )}
          {dayProgress !== null && (
            <span
              className={`text-xs font-medium tabular ${
                dayProgress.done === dayProgress.total ? 'text-brand' : 'text-muted'
              }`}
            >
              {dayProgress.done}/{dayProgress.total} ✓
            </span>
          )}
          <span className="ml-auto text-muted">
            {open
              ? <ChevronUpIcon className="h-3.5 w-3.5" />
              : <ChevronDownIcon className="h-3.5 w-3.5" />
            }
          </span>
        </button>
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

      {open && (
        <>
          {/* Exercises list — sortable by drag */}
          {localItems.length === 0 ? (
            <p className="py-1.5 text-center text-xs text-muted">Sin ejercicios todavía</p>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={localItems.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-1.5">
                  {localItems.map((item) => (
                    <ExerciseRow
                      key={item.id}
                      item={item}
                      todaySets={
                        isToday && byExercise !== null
                          ? (byExercise.get(item.exerciseId) ?? [])
                          : undefined
                      }
                      onRemove={() => hook.removeExercise(routineId, day.id, item.id)}
                      onRegister={onRegister}
                      onEditPlan={() =>
                        onOpenModal({ type: 'edit-item-plan', routineId, dayId: day.id, item })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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
        </>
      )}
    </div>
  );
}

// ─── RoutineCard ──────────────────────────────────────────────────────────────

function RoutineCard({
  routine,
  isExpanded,
  onToggle,
  hook,
  byExercise,
  todayAbbr,
  todaySelection,
  onOpenModal,
  onRegister,
}: {
  routine: Routine;
  isExpanded: boolean;
  onToggle: () => void;
  hook: ReturnType<typeof useRoutines>;
  byExercise: Map<string, WorkoutSet[]> | null;
  todayAbbr: string;
  todaySelection: TodaySelection | null;
  onOpenModal: (state: ModalState) => void;
  onRegister: (ex: Exercise, plannedRestSeconds?: number | null) => void;
}) {
  const [localDays, setLocalDays] = useState<RoutineDay[]>(() =>
    [...routine.days].sort((a, b) => a.order - b.order),
  );
  useEffect(() => {
    setLocalDays([...routine.days].sort((a, b) => a.order - b.order));
  }, [routine.days]);

  const daySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDayDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setLocalDays((curr) => {
      const oldIdx = curr.findIndex((d) => d.id === active.id);
      const newIdx = curr.findIndex((d) => d.id === over.id);
      const next = arrayMove(curr, oldIdx, newIdx);
      void hook.reorderDays(routine.id, next.map((d) => d.id));
      return next;
    });
  }

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
          {localDays.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted">Sin días todavía</p>
          ) : (
            <DndContext sensors={daySensors} onDragEnd={handleDayDragEnd}>
              <SortableContext
                items={localDays.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2">
                  {localDays.map((day) => (
                    <DaySection
                      key={day.id}
                      day={day}
                      routineId={routine.id}
                      hook={hook}
                      byExercise={byExercise}
                      todayAbbr={todayAbbr}
                      todaySelection={todaySelection}
                      onOpenAddExercise={() =>
                        onOpenModal({ type: 'add-exercise', routineId: routine.id, dayId: day.id })
                      }
                      onOpenEditDay={() =>
                        onOpenModal({ type: 'edit-day', routineId: routine.id, day })
                      }
                      onRegister={onRegister}
                      onOpenModal={onOpenModal}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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

export function RoutinesScreen({
  onRegister,
}: {
  onRegister: (ex: Exercise, plannedRestSeconds?: number | null) => void;
}) {
  const hook = useRoutines();
  const { routines, status, error, reload } = hook;
  const { byExercise } = useTodaySets();
  const todayAbbr = useMemo(() => todayWeekdayMVD(), []);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [todaySelection, setTodaySelection] = useState<TodaySelection | null>(loadTodaySelection);

  function closeModal() {
    setModal(null);
  }

  function handleTodaySelectionSave(sel: TodaySelection | null) {
    saveTodaySelection(sel);
    setTodaySelection(sel);
  }

  // Indicador de selección activa: IDs que aplican hoy
  const selectionSummary = useMemo(() => {
    if (!todaySelection) return null;
    const dayNames: string[] = [];
    for (const r of routines) {
      for (const d of r.days) {
        if (todaySelection.dayIds.includes(d.id)) dayNames.push(d.name);
      }
    }
    return dayNames.join(', ');
  }, [todaySelection, routines]);

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
      {/* Fila de acciones: selector de hoy + nueva rutina */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => setModal({ type: 'today-session' })}
          className={`flex flex-1 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
            todaySelection
              ? 'border-brand bg-brand-soft/20 text-brand'
              : 'border-border text-muted hover:border-brand/40 hover:text-fg'
          }`}
        >
          <CalendarIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">
            {selectionSummary
              ? `Hoy: ${selectionSummary}`
              : '¿Qué entrenás hoy?'}
          </span>
        </button>
        <div className="flex gap-2 sm:w-auto">
          <Button
            variant="secondary"
            onClick={() => setModal({ type: 'import' })}
            className="flex-1 sm:flex-none"
          >
            <DumbbellIcon className="h-5 w-5" />
            Importar rutina
          </Button>
          <Button
            onClick={() => setModal({ type: 'create-routine' })}
            className="flex-1 sm:flex-none"
          >
            <PlusIcon className="h-5 w-5" />
            Nueva rutina
          </Button>
        </div>
      </div>

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
              byExercise={byExercise}
              todayAbbr={todayAbbr}
              todaySelection={todaySelection}
              onOpenModal={setModal}
              onRegister={onRegister}
            />
          ))}
        </div>
      )}

      {/* ─── Modals ─── */}
      {modal !== null && modal.type === 'today-session' && (
        <TodaySessionModal
          routines={routines}
          currentSelection={todaySelection}
          onSave={handleTodaySelectionSave}
          onClose={closeModal}
          onCreateRoutine={() => { setModal({ type: 'create-routine' }); }}
        />
      )}
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
          presets={WEEKDAY_PRESETS}
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
          presets={WEEKDAY_PRESETS}
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
      {modal !== null && modal.type === 'edit-item-plan' && (
        <ItemPlanModal
          item={modal.item}
          onSubmit={(patch) => hook.editItemPlan(modal.routineId, modal.dayId, modal.item.id, patch)}
          onClose={closeModal}
        />
      )}
      {modal !== null && modal.type === 'import' && (
        <ImportRoutineModal
          onClose={closeModal}
          onImported={(r) => {
            void hook.reload();
            setExpandedId(r.id);
            closeModal();
          }}
        />
      )}
    </div>
  );
}
