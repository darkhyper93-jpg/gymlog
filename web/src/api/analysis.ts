import { apiRequest } from './client';
import type { LoadSuggestion, RoutineDeloadStatus } from '../types';

export const getExerciseSuggestion = (exerciseId: string): Promise<LoadSuggestion> =>
  apiRequest<LoadSuggestion>(`/analysis/exercise/${exerciseId}`);

export const getRoutineDeloadStatus = (routineId: string): Promise<RoutineDeloadStatus> =>
  apiRequest<RoutineDeloadStatus>(`/analysis/routine/${routineId}/deload`);
