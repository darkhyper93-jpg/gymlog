import { apiRequest } from './client';
import type { WorkoutSet, Achievement } from '../types';

export type NewSet = {
  exerciseId: string;
  weight: number;
  reps: number;
  rir?: number;
};

export type SetResponse = {
  set: WorkoutSet;
  prs: { weightPR: boolean; oneRmPR: boolean };
  achievements: Achievement[];
};

export function createSet(input: NewSet): Promise<SetResponse> {
  return apiRequest<SetResponse>('/sets', { method: 'POST', body: input });
}
