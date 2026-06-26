import { apiRequest } from './client';
import type { Routine, RoutineDay, RoutineDayExercise } from '../types';

export const listRoutines = (): Promise<Routine[]> =>
  apiRequest<Routine[]>('/routines');

export const createRoutine = (name: string): Promise<Routine> =>
  apiRequest<Routine>('/routines', { method: 'POST', body: { name } });

export const updateRoutine = (id: string, data: { name?: string; order?: number }): Promise<Routine> =>
  apiRequest<Routine>(`/routines/${id}`, { method: 'PATCH', body: data });

export const deleteRoutine = (id: string): Promise<{ id: string }> =>
  apiRequest<{ id: string }>(`/routines/${id}`, { method: 'DELETE' });

export const createRoutineDay = (routineId: string, name: string): Promise<RoutineDay> =>
  apiRequest<RoutineDay>(`/routines/${routineId}/days`, { method: 'POST', body: { name } });

export const updateRoutineDay = (dayId: string, data: { name?: string; order?: number }): Promise<RoutineDay> =>
  apiRequest<RoutineDay>(`/routine-days/${dayId}`, { method: 'PATCH', body: data });

export const deleteRoutineDay = (dayId: string): Promise<{ id: string }> =>
  apiRequest<{ id: string }>(`/routine-days/${dayId}`, { method: 'DELETE' });

export const addExerciseToDay = (dayId: string, exerciseId: string): Promise<RoutineDayExercise> =>
  apiRequest<RoutineDayExercise>(`/routine-days/${dayId}/exercises`, { method: 'POST', body: { exerciseId } });

export const updateDayExercise = (itemId: string, order: number): Promise<RoutineDayExercise> =>
  apiRequest<RoutineDayExercise>(`/routine-day-exercises/${itemId}`, { method: 'PATCH', body: { order } });

export const removeDayExercise = (itemId: string): Promise<{ id: string }> =>
  apiRequest<{ id: string }>(`/routine-day-exercises/${itemId}`, { method: 'DELETE' });

export const reorderDayExercises = (dayId: string, itemIds: string[]): Promise<{ count: number }> =>
  apiRequest<{ count: number }>(`/routine-days/${dayId}/reorder`, { method: 'PATCH', body: { itemIds } });

export const reorderRoutineDays = (routineId: string, dayIds: string[]): Promise<{ count: number }> =>
  apiRequest<{ count: number }>(`/routines/${routineId}/reorder`, { method: 'PATCH', body: { dayIds } });
