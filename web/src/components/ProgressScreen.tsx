import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Exercise, WorkoutSet } from '../types';
import { useExercises } from '../hooks/useExercises';
import { useBodyWeight } from '../hooks/useBodyWeight';
import { localDayKey } from '../hooks/useRegister';
import { getExerciseSets } from '../api/exercises';
import { downloadExportCsv } from '../api/export';
import { muscleGroupLabel, MUSCLE_GROUPS } from '../muscleGroups';
import { Button, Card, Chip, NumberField, SectionLabel, Spinner, StateView, TextInput } from './ui';
import { AlertTriangleIcon, ChevronLeftIcon, DumbbellIcon, PlusIcon, TrashIcon, TrendingUpIcon, TrophyIcon } from './icons';
import { ProgressChart } from './ProgressChart';
import type { ChartPoint } from './ProgressChart';

// DECISIÓN: Epley — misma fórmula que el backend para 1RM estimado.
function est1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

type Metric = 'topset' | 'volume' | '1rm';

const METRIC_LABELS: Record<Metric, string> = {
  topset: 'Top set',
  volume: 'Volumen',
  '1rm': '1RM est.',
};

const METRICS: Metric[] = ['topset', 'volume', '1rm'];

const OTHERS_KEY = '__otros__';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computePRs(sets: WorkoutSet[]) {
  if (sets.length === 0) return { maxWeight: null, best1RM: null };
  let maxWeight = -Infinity;
  let best1RM = -Infinity;
  for (const s of sets) {
    if (s.weight > maxWeight) maxWeight = s.weight;
    const rm = est1RM(s.weight, s.reps);
    if (rm > best1RM) best1RM = rm;
  }
  return { maxWeight, best1RM };
}

function computeChartPoints(sets: WorkoutSet[], metric: Metric): ChartPoint[] {
  const byDay = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const key = localDayKey(s.date);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(s);
    else byDay.set(key, [s]);
  }
  return [...byDay.entries()]
    .map(([date, daySets]) => {
      let value: number;
      if (metric === 'topset') {
        value = Math.max(...daySets.map((s) => s.weight));
      } else if (metric === 'volume') {
        value = daySets.reduce((sum, s) => sum + s.weight * s.reps, 0);
      } else {
        value = Math.max(...daySets.map((s) => est1RM(s.weight, s.reps)));
      }
      return { date, value };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Body weight section ──────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function BodyWeightSection() {
  const { status, entries, addEntry, removeEntry } = useBodyWeight();
  const [weightInput, setWeightInput] = useState('');
  const today = useMemo(() => todayLocalStr(), []);
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const w = Number(weightInput);
    if (!weightInput || !Number.isFinite(w) || w <= 0) return;
    setSaving(true);
    setFormError(null);
    try {
      await addEntry({
        weight: w,
        date: date !== today ? `${date}T12:00:00.000-03:00` : undefined,
      });
      setWeightInput('');
      setDate(today);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <SectionLabel>Peso corporal</SectionLabel>
        <span className="text-xs text-muted">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <>
          {/* Última pesada */}
          {status === 'loading' && <Spinner />}
          {status === 'error' && (
            <p className="text-sm text-danger">Error al cargar el historial de peso</p>
          )}
          {status === 'ready' && entries.length > 0 && (
            <div className="flex flex-col gap-2">
              {entries.slice(0, 10).map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <span className="flex-1 text-sm text-fg tabular">{e.weight} kg</span>
                  <span className="text-xs text-muted">{formatDate(e.date)}</span>
                  <button
                    type="button"
                    onClick={() => void removeEntry(e.id)}
                    aria-label="Borrar pesada"
                    className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {entries.length > 10 && (
                <p className="text-center text-xs text-muted">Mostrando las últimas 10 pesadas</p>
              )}
            </div>
          )}
          {status === 'ready' && entries.length === 0 && (
            <p className="text-sm text-muted">Todavía no registraste tu peso. Empezá con la primera pesada.</p>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <NumberField
                  label="Peso (kg)"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="0.0"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs font-medium text-muted">Fecha</label>
                <input
                  type="date"
                  value={date}
                  max={today}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
                />
              </div>
            </div>
            <Button type="submit" disabled={!weightInput || saving}>
              <PlusIcon className="h-4 w-4" />
              {saving ? 'Guardando…' : 'Registrar'}
            </Button>
          </form>
          {formError && <p className="text-sm text-danger">{formError}</p>}
        </>
      )}
    </Card>
  );
}

// ─── Exercise selector ────────────────────────────────────────────────────────

function ExerciseSelector({
  exercises,
  status,
  error,
  reload,
  onSelect,
}: {
  exercises: Exercise[];
  status: string;
  error: string | null;
  reload: () => void;
  onSelect: (ex: Exercise) => void;
}) {
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadExportCsv();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setExporting(false);
    }
  }

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

  if (status === 'loading') return <Spinner />;

  if (status === 'error') {
    return (
      <StateView
        icon={<AlertTriangleIcon className="h-12 w-12" />}
        title="Error al cargar ejercicios"
        subtitle={error ?? undefined}
        action={<Button variant="secondary" onClick={reload}>Reintentar</Button>}
      />
    );
  }

  if (exercises.length === 0) {
    return (
      <StateView
        icon={<TrendingUpIcon className="h-12 w-12" />}
        title="Sin ejercicios todavía"
        subtitle="Creá ejercicios y registrá series para ver tu progreso acá."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Elegí un ejercicio para ver su progreso y PRs.</p>
        {exercises.length > 0 && (
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="shrink-0 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium
              text-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {exporting ? 'Exportando…' : '↓ CSV'}
          </button>
        )}
      </div>
      {exportError && <p className="text-sm text-danger">{exportError}</p>}
      <TextInput
        placeholder="Buscar ejercicio…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {sections.length === 0 && (
        <p className="py-4 text-center text-sm text-muted">Sin resultados</p>
      )}
      {sections.map((section) => (
        <div key={section.key}>
          <SectionLabel>{section.label}</SectionLabel>
          <div className="mt-2 flex flex-col gap-2">
            {section.items.map((ex) => (
              <button
                key={ex.id}
                onClick={() => onSelect(ex)}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent
                  bg-surface px-4 py-3 text-left transition-colors
                  hover:border-brand hover:bg-brand-soft active:scale-[0.98]"
              >
                <DumbbellIcon className="h-4 w-4 shrink-0 text-muted" />
                <span className="flex-1 text-sm font-semibold text-fg">{ex.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {muscleGroupLabel(ex.muscleGroup)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function ExerciseDetail({ exercise, onBack }: { exercise: Exercise; onBack: () => void }) {
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [setsStatus, setSetsStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [metric, setMetric] = useState<Metric>('topset');

  useEffect(() => {
    setSetsStatus('loading');
    setSets([]);
    getExerciseSets(exercise.id)
      .then((data) => { setSets(data); setSetsStatus('ready'); })
      .catch(() => setSetsStatus('error'));
  }, [exercise.id]);

  const prs = useMemo(() => computePRs(sets), [sets]);
  const chartPoints = useMemo(() => computeChartPoints(sets, metric), [sets, metric]);

  return (
    <div className="flex flex-col gap-5">
      {/* Back + exercise header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Volver a la lista"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
            bg-surface-2 text-muted transition-colors hover:bg-border hover:text-fg"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-fg">{exercise.name}</h2>
          {exercise.muscleGroup && (
            <div className="mt-1">
              <Chip tone="neutral">{muscleGroupLabel(exercise.muscleGroup)}</Chip>
            </div>
          )}
        </div>
      </div>

      {setsStatus === 'loading' && <Spinner />}

      {setsStatus === 'error' && (
        <StateView
          icon={<AlertTriangleIcon className="h-10 w-10" />}
          title="Error al cargar el historial"
          action={
            <Button variant="secondary" onClick={() => {
              setSetsStatus('loading');
              getExerciseSets(exercise.id)
                .then((data) => { setSets(data); setSetsStatus('ready'); })
                .catch(() => setSetsStatus('error'));
            }}>
              Reintentar
            </Button>
          }
        />
      )}

      {setsStatus === 'ready' && sets.length === 0 && (
        <StateView
          icon={<TrendingUpIcon className="h-12 w-12" />}
          title="Sin historial todavía"
          subtitle="Registrá series de este ejercicio para ver tu progreso."
        />
      )}

      {setsStatus === 'ready' && sets.length > 0 && (
        <>
          {/* PR cards */}
          <div>
            <SectionLabel>Récords personales</SectionLabel>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Card className="flex flex-col items-center gap-1 py-4">
                <TrophyIcon className="h-5 w-5 text-brand" />
                <p className="tabular mt-1 text-2xl font-bold text-fg">
                  {prs.maxWeight != null ? `${prs.maxWeight}` : '—'}
                </p>
                <p className="text-xs text-muted">kg · peso máx.</p>
              </Card>
              <Card className="flex flex-col items-center gap-1 py-4">
                <TrophyIcon className="h-5 w-5 text-accent" />
                <p className="tabular mt-1 text-2xl font-bold text-fg">
                  {prs.best1RM != null ? `${Math.round(prs.best1RM * 10) / 10}` : '—'}
                </p>
                <p className="text-xs text-muted">kg · 1RM est.</p>
              </Card>
            </div>
          </div>

          {/* Metric toggles + chart */}
          <div className="flex flex-col gap-3">
            <SectionLabel>Progreso</SectionLabel>
            <div className="flex overflow-hidden rounded-xl border border-border">
              {METRICS.map((m, i) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors
                    ${i > 0 ? 'border-l border-border' : ''}
                    ${metric === m ? 'bg-brand text-white' : 'text-muted hover:text-fg'}`}
                >
                  {METRIC_LABELS[m]}
                </button>
              ))}
            </div>
            <Card className="p-4">
              {chartPoints.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">Sin datos suficientes</p>
              ) : (
                <ProgressChart points={chartPoints} />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ─── ProgressScreen ───────────────────────────────────────────────────────────

export function ProgressScreen() {
  const { exercises, status, error, reload } = useExercises();
  const [selected, setSelected] = useState<Exercise | null>(null);

  if (selected) {
    return <ExerciseDetail exercise={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <BodyWeightSection />
      <ExerciseSelector
        exercises={exercises}
        status={status}
        error={error}
        reload={reload}
        onSelect={setSelected}
      />
    </div>
  );
}
