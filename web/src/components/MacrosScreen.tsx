import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  type MacrosProfile,
  type MacrosResult,
  calculateMacros,
  loadMacrosProfile,
  saveMacrosProfile,
} from '../lib/macros';
import { useBodyWeight } from '../hooks/useBodyWeight';
import { Button, Card, NumberField, SectionLabel } from './ui';
import { FlameIcon } from './icons';
import { loadRestBetweenExercises, saveRestBetweenExercises } from './RegisterScreen';

// ─── Helpers de UI ────────────────────────────────────────────────────────────

function MacroBar({
  label,
  value,
  unit,
  kcal,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  kcal: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-fg">{label}</span>
        <span className="tabular text-sm font-bold text-fg">
          {value} {unit}
          <span className="ml-1.5 text-xs font-normal text-muted">({kcal} kcal)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: '100%' }} />
      </div>
    </div>
  );
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: MacrosResult }) {
  return (
    <Card className="flex flex-col gap-5">
      {/* Calorías principales */}
      <div className="flex flex-col items-center gap-1 rounded-xl bg-brand-soft/20 py-4">
        <span className="text-4xl font-extrabold tabular text-brand">{result.kcalTarget}</span>
        <span className="text-sm font-medium text-muted">kcal / día</span>
        <span className="text-xs text-muted">
          BMR {Math.round(result.bmr)} · TDEE {result.tdee}
        </span>
      </div>

      {/* Macros */}
      <div className="flex flex-col gap-3">
        <SectionLabel>Macros</SectionLabel>
        <MacroBar
          label="Proteína"
          value={result.protein}
          unit="g"
          kcal={result.protein * 4}
          color="bg-brand"
        />
        <MacroBar
          label="Grasa"
          value={result.fat}
          unit="g"
          kcal={result.fat * 9}
          color="bg-accent"
        />
        <MacroBar
          label="Carbohidratos"
          value={result.carbs}
          unit="g"
          kcal={result.carbs * 4}
          color="bg-success"
        />
        {result.carbsNegative && (
          <p className="text-xs text-muted italic">
            Las calorías de proteína y grasa ya superan el objetivo: carbos en 0. Revisá los datos.
          </p>
        )}
      </div>

      {/* Agua */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Agua diaria</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col items-center rounded-xl border border-border/60 bg-surface-lowest py-3">
            <span className="tabular text-2xl font-bold text-fg">{result.waterBase} L</span>
            <span className="text-xs text-muted">Días de descanso</span>
          </div>
          <div className="flex flex-col items-center rounded-xl border border-brand/30 bg-brand-soft/10 py-3">
            <span className="tabular text-2xl font-bold text-brand">{result.waterTraining} L</span>
            <span className="text-xs text-muted">Días de entrenamiento</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── ProfileForm ──────────────────────────────────────────────────────────────

function ProfileForm({
  initial,
  initialWeight,
  onSave,
}: {
  initial: MacrosProfile | null;
  initialWeight: number | null;
  onSave: (p: MacrosProfile) => void;
}) {
  const [gender, setGender] = useState<'male' | 'female'>(initial?.gender ?? 'male');
  const [age, setAge] = useState(initial ? String(initial.age) : '');
  const [height, setHeight] = useState(initial ? String(initial.height) : '');
  const [weight, setWeight] = useState(
    initial ? String(initial.weight) : initialWeight ? String(initialWeight) : '',
  );
  const [trainingDays, setTrainingDays] = useState(initial ? String(initial.trainingDays) : '4');
  const [goal, setGoal] = useState<MacrosProfile['goal']>(initial?.goal ?? 'maintain');

  const valid = useMemo(() => {
    const a = Number(age);
    const h = Number(height);
    const w = Number(weight);
    const d = Number(trainingDays);
    return (
      Number.isInteger(a) && a > 0 && a < 120 &&
      Number.isFinite(h) && h > 0 &&
      Number.isFinite(w) && w > 0 &&
      Number.isInteger(d) && d >= 0 && d <= 7
    );
  }, [age, height, weight, trainingDays]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSave({
      gender,
      age: Number(age),
      height: Number(height),
      weight: Number(weight),
      trainingDays: Number(trainingDays),
      goal,
    });
  }

  const goalOptions: { value: MacrosProfile['goal']; label: string }[] = [
    { value: 'lose', label: 'Perder grasa' },
    { value: 'maintain', label: 'Mantener' },
    { value: 'gain', label: 'Ganar músculo' },
  ];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Género */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Género</SectionLabel>
        <div className="flex gap-2">
          {(['male', 'female'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                gender === g
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-border text-muted hover:border-brand/50 hover:text-fg'
              }`}
            >
              {g === 'male' ? 'Masculino' : 'Femenino'}
            </button>
          ))}
        </div>
      </div>

      {/* Datos físicos */}
      <div className="flex gap-2">
        <NumberField label="Edad (años)" value={age} onChange={(e) => setAge(e.target.value)} placeholder="25" />
        <NumberField label="Altura (cm)" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="175" />
        <NumberField label="Peso (kg)" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="75" />
      </div>

      {/* Días de entrenamiento */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Días de entrenamiento / semana</SectionLabel>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setTrainingDays(String(d))}
              className={`flex h-9 flex-1 items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${
                trainingDays === String(d)
                  ? 'border-brand bg-brand text-white'
                  : 'border-border text-muted hover:border-brand/50 hover:text-fg'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Objetivo */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Objetivo</SectionLabel>
        <div className="flex flex-col gap-1.5">
          {goalOptions.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setGoal(value)}
              className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                goal === value
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-border text-muted hover:border-brand/50 hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={!valid}>
        <FlameIcon className="h-5 w-5" />
        Calcular
      </Button>
    </form>
  );
}

// ─── RestBetweenConfig ────────────────────────────────────────────────────────

function RestBetweenConfig() {
  const [value, setValue] = useState(() => String(loadRestBetweenExercises()));
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return;
    saveRestBetweenExercises(n);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <Card className="flex flex-col gap-3">
      <SectionLabel>Descanso entre ejercicios</SectionLabel>
      <p className="text-sm text-muted">
        Tiempo de descanso cuando marcás "última serie de este ejercicio" al registrar.
      </p>
      <div className="flex items-end gap-2">
        <NumberField
          label="Segundos"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          placeholder="180"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleSave}
          className="shrink-0"
          disabled={!Number.isInteger(Number(value)) || Number(value) <= 0}
        >
          {saved ? 'Guardado ✓' : 'Guardar'}
        </Button>
      </div>
    </Card>
  );
}

// ─── MacrosScreen ─────────────────────────────────────────────────────────────

export function MacrosScreen() {
  const [profile, setProfile] = useState<MacrosProfile | null>(loadMacrosProfile);
  const [result, setResult] = useState<MacrosResult | null>(() => {
    const p = loadMacrosProfile();
    return p ? calculateMacros(p) : null;
  });
  const { entries } = useBodyWeight();

  // Prefill con el peso más reciente si no hay perfil guardado
  const latestWeight = useMemo(() => {
    if (entries.length === 0) return null;
    return entries[0].weight;
  }, [entries]);

  function handleSave(p: MacrosProfile) {
    saveMacrosProfile(p);
    setProfile(p);
    setResult(calculateMacros(p));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <FlameIcon className="h-7 w-7 text-brand" />
        <div>
          <h2 className="text-xl font-bold text-fg">Macros y agua</h2>
          <p className="text-sm text-muted">Calculados con Mifflin-St Jeor</p>
        </div>
      </div>

      {result && profile && (
        <>
          <ResultCard result={result} />
          <Card className="p-0 overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-fg select-none hover:bg-surface-2">
                Cambiar perfil
                <span className="text-muted group-open:rotate-180 transition-transform text-xs">▼</span>
              </summary>
              <div className="border-t border-border px-4 pb-4 pt-3">
                <ProfileForm
                  initial={profile}
                  initialWeight={latestWeight}
                  onSave={handleSave}
                />
              </div>
            </details>
          </Card>
        </>
      )}

      {!result && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Completá tu perfil para calcular tus calorías, macros y consumo de agua diario.
          </p>
          <ProfileForm initial={null} initialWeight={latestWeight} onSave={handleSave} />
        </Card>
      )}

      <RestBetweenConfig />
    </div>
  );
}
