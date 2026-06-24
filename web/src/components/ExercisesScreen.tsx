import { useMemo, useState } from 'react';
import type { Exercise } from '../types';
import { useExercises } from '../hooks/useExercises';
import { MUSCLE_GROUPS } from '../muscleGroups';
import { Button, Card, Chip, IconButton, Modal, Spinner, StateView } from './ui';
import { ExerciseForm } from './ExerciseForm';
import {
  AlertTriangleIcon,
  DumbbellIcon,
  PencilIcon,
  PlusIcon,
  TargetIcon,
  TrashIcon,
} from './icons';

const OTHERS_KEY = '__otros__';

type Section = { key: string; label: string; items: Exercise[] };

// Agrupa los ejercicios por grupo muscular, respetando el orden de MUSCLE_GROUPS y dejando
// "Otros" al final para los que no tienen grupo (datos viejos).
function groupExercises(exercises: Exercise[]): Section[] {
  const byKey = new Map<string, Exercise[]>();
  for (const ex of exercises) {
    const key = ex.muscleGroup ?? OTHERS_KEY;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(ex);
    else byKey.set(key, [ex]);
  }
  const sections: Section[] = [];
  for (const g of MUSCLE_GROUPS) {
    const items = byKey.get(g.key);
    if (items && items.length > 0) sections.push({ key: g.key, label: g.label, items });
  }
  const others = byKey.get(OTHERS_KEY);
  if (others && others.length > 0) sections.push({ key: OTHERS_KEY, label: 'Otros', items: others });
  return sections;
}

export function ExercisesScreen({ onSelect }: { onSelect: (exercise: Exercise) => void }) {
  const { exercises, status, error, reload, add, edit, remove } = useExercises();
  const [adding, setAdding] = useState(false);

  const sections = useMemo(() => groupExercises(exercises), [exercises]);

  return (
    <div className="flex flex-col gap-6">
      <Button onClick={() => setAdding(true)} className="w-full md:ml-auto md:w-auto">
        <PlusIcon className="h-5 w-5" />
        Agregar ejercicio
      </Button>

      {adding && (
        <Modal title="Agregar ejercicio" onClose={() => setAdding(false)}>
          <ExerciseForm
            submitLabel="Guardar"
            onSubmit={async (input) => {
              await add(input);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </Modal>
      )}

      {status === 'loading' && <Spinner />}

      {status === 'error' && (
        <StateView
          icon={<AlertTriangleIcon className="h-10 w-10 text-danger" />}
          title="No se pudieron cargar los ejercicios"
          subtitle={error ?? undefined}
          action={
            <Button variant="ghost" onClick={() => void reload()}>
              Reintentar
            </Button>
          }
        />
      )}

      {status === 'ready' && exercises.length === 0 && (
        <StateView
          icon={<DumbbellIcon className="h-10 w-10" />}
          title="Todavía no hay ejercicios"
          subtitle="Agregá tu primer ejercicio para empezar a registrar tus series."
          action={
            <Button onClick={() => setAdding(true)}>
              <PlusIcon className="h-5 w-5" />
              Agregar ejercicio
            </Button>
          }
        />
      )}

      {status === 'ready' && exercises.length > 0 && (
        // 1 columna en celular (mobile-first); hasta 3 columnas en pantalla ancha (masonry-ish).
        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-7 md:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <section key={section.key} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                  {section.label}
                </h2>
                <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">
                  {section.items.length}
                </span>
              </div>
              <ul className="flex flex-col gap-4">
                {section.items.map((ex) => (
                  <li key={ex.id}>
                    <ExerciseCard exercise={ex} onEdit={edit} onDelete={remove} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ExerciseCard({
  exercise,
  onEdit,
  onDelete,
  onSelect,
}: {
  exercise: Exercise;
  onEdit: (id: string, input: { name?: string; target?: string; muscleGroup?: string; restSeconds?: number | null }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSelect: (exercise: Exercise) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`¿Borrar "${exercise.name}" y todas sus series?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(exercise.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar');
      setDeleting(false);
    }
  }

  return (
    <>
      <Card className="flex flex-col gap-4 transition-colors hover:border-brand">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="truncate text-lg font-bold text-fg">{exercise.name}</p>
            {exercise.target ? (
              <Chip icon={<TargetIcon className="h-4 w-4" />}>{exercise.target}</Chip>
            ) : (
              <span className="text-sm text-muted/70">Sin objetivo</span>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <IconButton aria-label="Editar ejercicio" onClick={() => setEditing(true)}>
              <PencilIcon className="h-5 w-5" />
            </IconButton>
            <IconButton
              aria-label="Borrar ejercicio"
              onClick={handleDelete}
              disabled={deleting}
              className="hover:bg-danger/10 hover:text-danger"
            >
              <TrashIcon className="h-5 w-5" />
            </IconButton>
          </div>
        </div>
        <Button variant="secondary" onClick={() => onSelect(exercise)} className="w-full">
          Registrar hoy
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </Card>

      {editing && (
        <Modal title="Editar ejercicio" onClose={() => setEditing(false)}>
          <ExerciseForm
            initial={{
              name: exercise.name,
              target: exercise.target ?? '',
              muscleGroup: exercise.muscleGroup ?? '',
              restSeconds: exercise.restSeconds,
            }}
            submitLabel="Guardar"
            onSubmit={async (input) => {
              await onEdit(exercise.id, input);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}
    </>
  );
}
