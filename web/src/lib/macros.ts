// Módulo puro de cálculo de macros y agua (sin side effects, sin any).

export type MacrosProfile = {
  gender: 'male' | 'female';
  age: number;          // años
  height: number;       // cm
  weight: number;       // kg
  trainingDays: number; // 0–7
  goal: 'lose' | 'maintain' | 'gain';
};

export type MacrosResult = {
  bmr: number;
  tdee: number;
  kcalTarget: number;
  protein: number;  // g
  fat: number;      // g
  carbs: number;    // g
  waterBase: number;    // L (días de descanso)
  waterTraining: number; // L (días de entrenamiento)
  carbsNegative: boolean; // true si kcal_restantes < 0
};

// Factores de actividad según días de entrenamiento por semana (Mifflin-St Jeor / Harris-Benedict)
function activityFactor(trainingDays: number): number {
  if (trainingDays === 0) return 1.2;
  if (trainingDays <= 2) return 1.375;
  if (trainingDays <= 4) return 1.55;
  if (trainingDays <= 6) return 1.725;
  return 1.9;
}

// Ajuste por objetivo
function goalMultiplier(goal: MacrosProfile['goal']): number {
  if (goal === 'lose') return 0.8;
  if (goal === 'gain') return 1.1;
  return 1.0;
}

export function calculateMacros(p: MacrosProfile): MacrosResult {
  // BMR Mifflin-St Jeor
  const bmrBase = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  const bmr = p.gender === 'male' ? bmrBase + 5 : bmrBase - 161;

  const tdee = bmr * activityFactor(p.trainingDays);
  const kcalTarget = Math.round(tdee * goalMultiplier(p.goal));

  const protein = Math.round(2.0 * p.weight);
  const fat = Math.round(0.9 * p.weight);
  const kcalFromProteinAndFat = protein * 4 + fat * 9;
  const carbsKcal = kcalTarget - kcalFromProteinAndFat;
  const carbsNegative = carbsKcal < 0;
  const carbs = Math.max(0, Math.round(carbsKcal / 4));

  // Agua: 35 ml/kg base; +500 ml días de entrenamiento
  const waterBase = Math.round((35 * p.weight) / 100) / 10; // L a 1 decimal
  const waterTraining = Math.round((35 * p.weight + 500) / 100) / 10;

  return {
    bmr: Math.round(bmr * 100) / 100,
    tdee: Math.round(tdee),
    kcalTarget,
    protein,
    fat,
    carbs,
    waterBase,
    waterTraining,
    carbsNegative,
  };
}

const PROFILE_KEY = 'macros-profile';

export function loadMacrosProfile(): MacrosProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MacrosProfile;
  } catch {
    return null;
  }
}

export function saveMacrosProfile(p: MacrosProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}
