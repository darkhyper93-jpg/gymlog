import { apiRequest } from './client';
import type { WorkoutSet, Achievement } from '../types';

export type NewSet = {
  exerciseId: string;
  weight: number;
  reps: number;
  rir?: number;
  date?: string;   // ISO — si no se envía, el backend usa now()
  note?: string;
};

export type SetResponse = {
  set: WorkoutSet;
  prs: { weightPR: boolean; oneRmPR: boolean };
  achievements: Achievement[];
};

export type UpdateSetInput = {
  weight?: number;
  reps?: number;
  rir?: number | null;
  note?: string | null;
};

export function createSet(input: NewSet): Promise<SetResponse> {
  return apiRequest<SetResponse>('/sets', { method: 'POST', body: input });
}

export function getTodaySets(): Promise<WorkoutSet[]> {
  return apiRequest<WorkoutSet[]>('/sets/today');
}

export function deleteSet(id: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/sets/${id}`, { method: 'DELETE' });
}

export function updateSet(id: string, input: UpdateSetInput): Promise<WorkoutSet> {
  return apiRequest<WorkoutSet>(`/sets/${id}`, { method: 'PATCH', body: input });
}
