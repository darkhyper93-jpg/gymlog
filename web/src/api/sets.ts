import { apiRequest } from './client';
import type { WorkoutSet } from '../types';

export type NewSet = {
  exerciseId: string;
  weight: number;
  reps: number;
  rir?: number;
};

export function createSet(input: NewSet): Promise<WorkoutSet> {
  return apiRequest<WorkoutSet>('/sets', { method: 'POST', body: input });
}
