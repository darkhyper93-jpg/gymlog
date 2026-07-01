import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { parseImport, commitImport } from '../api/import';
import type { ImportDay, ImportExercise, ImportRoutine, MuscleGroup, Routine } from '../types';
import { ApiError } from '../api/client';
import { Button, Select, Spinner, TextInput } from './ui';
import { AlertTriangleIcon, DumbbellIcon, PlusIcon, TrashIcon } from './icons';
import { MUSCLE_GROUPS } from '../muscleGroups';
import { useMuscleGroups } from '../hooks/useMuscleGroups';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Phase = 'input' | 'parsing' | 'error' | 'preview';

// ─── helpers ─────────────────────────────────────────────────────────────────

function emptyExercise(): ImportExercise {
  return {
    name: '',
    plannedSets: null,
    plannedReps: null,
    plannedRir: null,
    restSeconds: null,
    note: null,
    muscleGroup: null,
  };
}

function toIntOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 ? null : n;
}

function nullIfEmpty(v: string): string | null {
  return v.trim() === '' ? null : v.trim();
}

// Prepara la rutina para enviar al backend: convierte strings vacíos a null.
function cleanForCommit(r: ImportRoutine): ImportRoutine {
  return {
    name: nullIfEmpty(r.name ?? ''),
    days: r.days.map((d) => ({
      name: nullIfEmpty(d.name ?? ''),
      exercises: d.exercises.map((ex) => ({
        name: nullIfEmpty(ex.name ?? ''),
        plannedSets: ex.plannedSets,
        plannedReps: nullIfEmpty(ex.plannedReps ?? ''),
        plannedRir: nullIfEmpty(ex.plannedRir ?? ''),
        restSeconds: ex.restSeconds,
        note: nullIfEmpty(ex.note ?? ''),
        muscleGroup: ex.muscleGroup,
      })),
    })),
  };
}

function hasUnnamedExercise(r: ImportRoutine): boolean {
  return r.days.some((d) => d.exercises.some((ex) => !ex.name || ex.name.trim() === ''));
}

// ─── ExerciseRow editable ────────────────────────────────────────────────────

function ExerciseRow({
  ex,
  customGroups,
  onChange,
  onRemove,
}: {
  ex: ImportExercise;
  customGroups: MuscleGroup[];
  onChange: (updated: ImportExercise) => void;
  onRemove: () => void;
}) {
  const unnamed = !ex.name || ex.name.trim() === '';
  return (
    <div className={`rounded-xl border p-3 ${unnamed ? 'border-danger bg-danger/5' : 'border-border bg-surface'}`}>
      {/* Nombre */}
      <div className="mb-2 flex items-center gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            {unnamed ? (
              <span className="text-danger flex items-center gap-1">
                <AlertTriangleIcon className="h-3 w-3" /> No encontrado — completá el nombre
              </span>
            ) : 'Ejercicio'}
          </label>
          <TextInput
            value={ex.name ?? ''}
            placeholder="Nombre del ejercicio"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...ex, name: e.target.value })
            }
            className={unnamed ? 'border-danger focus:border-danger focus:ring-danger' : ''}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Quitar ejercicio"
          className="mt-5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted
            transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      {/* Campos opcionales */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Series</span>
          <input
            type="number"
            min={1}
            max={30}
            value={ex.plannedSets ?? ''}
            placeholder="—"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...ex, plannedSets: toIntOrNull(e.target.value) })
            }
            className="min-h-[40px] w-full rounded-lg border border-border bg-surface px-3 text-sm
              text-fg placeholder:text-muted/40 outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Reps</span>
          <input
            type="text"
            value={ex.plannedReps ?? ''}
            placeholder="8-10"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...ex, plannedReps: e.target.value })
            }
            className="min-h-[40px] w-full rounded-lg border border-border bg-surface px-3 text-sm
              text-fg placeholder:text-muted/40 outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">RIR</span>
          <input
            type="text"
            value={ex.plannedRir ?? ''}
            placeholder="1-2"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...ex, plannedRir: e.target.value })
            }
            className="min-h-[40px] w-full rounded-lg border border-border bg-surface px-3 text-sm
              text-fg placeholder:text-muted/40 outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Descanso (s)</span>
          <input
            type="number"
            min={0}
            max={3600}
            value={ex.restSeconds ?? ''}
            placeholder="90"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...ex, restSeconds: toIntOrNull(e.target.value) })
            }
            className="min-h-[40px] w-full rounded-lg border border-border bg-surface px-3 text-sm
              text-fg placeholder:text-muted/40 outline-none focus:border-brand"
          />
        </label>
      </div>
      <label className="mt-2 flex flex-col gap-1">
        <span className="text-xs text-muted">Grupo muscular</span>
        <Select
          value={ex.muscleGroup ?? ''}
          onChange={(e) => onChange({ ...ex, muscleGroup: e.target.value || null })}
        >
          <option value="">Otros</option>
          {MUSCLE_GROUPS.map((g) => (
            <option key={g.key} value={g.key}>{g.label}</option>
          ))}
          {customGroups.map((g) => (
            <option key={g.id} value={g.name}>{g.name}</option>
          ))}
        </Select>
      </label>
      <label className="mt-2 flex flex-col gap-1">
        <span className="text-xs text-muted">Nota</span>
        <input
          type="text"
          value={ex.note ?? ''}
          placeholder="Drop set, tempo 3-1-1…"
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange({ ...ex, note: e.target.value })
          }
          className="min-h-[40px] w-full rounded-lg border border-border bg-surface px-3 text-sm
            text-fg placeholder:text-muted/40 outline-none focus:border-brand"
        />
      </label>
    </div>
  );
}

// ─── Modal principal ──────────────────────────────────────────────────────────

export function ImportRoutineModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (routine: Routine) => void;
}) {
  const [phase, setPhase] = useState<Phase>('input');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState<ImportRoutine | null>(null);
  const [commitError, setCommitError] = useState('');
  const [committing, setCommitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { groups: customGroups } = useMuscleGroups();

  // ── Input phase ────────────────────────────────────────────────────────────

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_BYTES) {
      setFileError('El archivo supera los 5 MB. Usá uno más chico.');
      setFile(null);
      e.target.value = '';
      return;
    }
    setFileError('');
    setFile(f);
  }

  async function handleParse() {
    setPhase('parsing');
    try {
      const result = await parseImport({ file: file ?? undefined, text: text || undefined });
      setPreview(result);
      setPhase('preview');
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Error al interpretar la rutina');
      setPhase('error');
    }
  }

  // ── Preview phase ──────────────────────────────────────────────────────────

  function updateDay(di: number, updated: ImportDay) {
    if (!preview) return;
    const days = [...preview.days];
    days[di] = updated;
    setPreview({ ...preview, days });
  }

  function updateExercise(di: number, ei: number, updated: ImportExercise) {
    if (!preview) return;
    const day = preview.days[di];
    if (!day) return;
    const exercises = [...day.exercises];
    exercises[ei] = updated;
    updateDay(di, { ...day, exercises });
  }

  function removeExercise(di: number, ei: number) {
    if (!preview) return;
    const day = preview.days[di];
    if (!day) return;
    const exercises = day.exercises.filter((_, i) => i !== ei);
    updateDay(di, { ...day, exercises });
  }

  function addExercise(di: number) {
    if (!preview) return;
    const day = preview.days[di];
    if (!day) return;
    updateDay(di, { ...day, exercises: [...day.exercises, emptyExercise()] });
  }

  async function handleCommit() {
    if (!preview) return;
    const clean = cleanForCommit(preview);
    setCommitting(true);
    setCommitError('');
    try {
      const routine = await commitImport(clean);
      onImported(routine);
    } catch (err) {
      setCommitError(err instanceof ApiError ? err.message : 'Error al guardar la rutina');
    } finally {
      setCommitting(false);
    }
  }

  const canParse = text.trim().length > 0 || file !== null;
  const blocked = preview !== null && hasUnnamedExercise(preview);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pb-10 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Importar rutina"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface-2 shadow-card mt-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-fg">Importar rutina</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted
              transition-colors hover:bg-border hover:text-fg"
          >
            ✕
          </button>
        </div>

        <div className="p-5">

          {/* ── Input ── */}
          {phase === 'input' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                Pegá el texto de tu rutina o subí un archivo (txt, pdf, docx, xlsx, csv). El sistema lo interpreta y te muestra un preview editable antes de guardar.
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Texto</span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder="Ej: Día A — Press banca 4x8-10 RIR2 90s, Remo con barra 4x10 RIR1..."
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg
                    placeholder:text-muted/50 outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">O subí un archivo</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.pdf,.docx,.xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex min-h-[48px] items-center gap-2 rounded-xl border border-dashed border-border
                    px-4 text-sm text-muted transition-colors hover:border-brand hover:text-fg"
                >
                  <DumbbellIcon className="h-4 w-4 shrink-0" />
                  {file ? file.name : 'Elegir archivo (.txt, .pdf, .docx, .xlsx, .csv)'}
                </button>
                {fileError && <p className="text-xs text-danger">{fileError}</p>}
              </div>
              <Button onClick={handleParse} disabled={!canParse} className="w-full">
                <DumbbellIcon className="h-5 w-5" />
                Interpretar rutina
              </Button>
            </div>
          )}

          {/* ── Parsing ── */}
          {phase === 'parsing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner />
              <p className="text-sm text-muted">Interpretando tu rutina…</p>
            </div>
          )}

          {/* ── Error ── */}
          {phase === 'error' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <AlertTriangleIcon className="h-12 w-12 text-danger" />
              <div className="text-center">
                <p className="font-semibold text-fg">No se pudo interpretar</p>
                <p className="mt-1 text-sm text-muted">{errorMsg}</p>
              </div>
              <Button variant="secondary" onClick={() => setPhase('input')}>
                Volver a intentar
              </Button>
            </div>
          )}

          {/* ── Preview ── */}
          {phase === 'preview' && preview && (
            <div className="flex flex-col gap-4">
              {/* Nombre de rutina */}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Nombre de la rutina</span>
                <TextInput
                  value={preview.name ?? ''}
                  placeholder="Rutina importada"
                  onChange={(e) => setPreview({ ...preview, name: e.target.value })}
                />
              </label>

              {/* Días */}
              {preview.days.map((day, di) => (
                <div key={di} className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">Día {di + 1}</span>
                    <TextInput
                      value={day.name ?? ''}
                      placeholder={`Día ${di + 1}`}
                      onChange={(e) => updateDay(di, { ...day, name: e.target.value })}
                    />
                  </label>
                  <div className="flex flex-col gap-2">
                    {day.exercises.map((ex, ei) => (
                      <ExerciseRow
                        key={ei}
                        ex={ex}
                        customGroups={customGroups}
                        onChange={(updated) => updateExercise(di, ei, updated)}
                        onRemove={() => removeExercise(di, ei)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addExercise(di)}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-dashed
                      border-border px-3 text-sm text-muted transition-colors hover:border-brand hover:text-fg"
                  >
                    <PlusIcon className="h-4 w-4" /> Agregar ejercicio
                  </button>
                </div>
              ))}

              {/* Bloqueo */}
              {blocked && (
                <p className="rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger">
                  Completá los ejercicios sin nombre antes de guardar.
                </p>
              )}
              {commitError && (
                <p className="rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger">{commitError}</p>
              )}

              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPhase('input')} className="flex-1">
                  Volver
                </Button>
                <Button
                  onClick={handleCommit}
                  disabled={blocked || committing}
                  className="flex-1"
                >
                  {committing ? 'Guardando…' : 'Guardar rutina'}
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
