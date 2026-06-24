import { apiRequest } from './client';
import type { Exercise, LastSession, WorkoutSet } from '../types';

export function listExercises(): Promise<Exercise[]> {
  return apiRequest<Exercise[]>('/exercises');
}

export function createExercise(input: {
  name: string;
  target?: string;
  muscleGroup: string;
  restSeconds?: number | null;
}): Promise<Exercise> {
  return apiRequest<Exercise>('/exercises', { method: 'POST', body: input });
}

export function updateExercise(
  id: string,
  input: { name?: string; target?: string; muscleGroup?: string; restSeconds?: number | null },
): Promise<Exercise> {
  return apiRequest<Exercise>(`/exercises/${id}`, { method: 'PATCH', body: input });
}

export function deleteExercise(id: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/exercises/${id}`, { method: 'DELETE' });
}

export function getLastSession(id: string): Promise<LastSession> {
  return apiRequest<LastSession>(`/exercises/${id}/last`);
}

export function getExerciseSets(id: string): Promise<WorkoutSet[]> {
  return apiRequest<WorkoutSet[]>(`/exercises/${id}/sets`);
}
