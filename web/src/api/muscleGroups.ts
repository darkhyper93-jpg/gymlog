import { apiRequest } from './client';
import type { MuscleGroup } from '../types';

export const listMuscleGroups = (): Promise<MuscleGroup[]> =>
  apiRequest<MuscleGroup[]>('/muscle-groups');

export const createMuscleGroup = (name: string): Promise<MuscleGroup> =>
  apiRequest<MuscleGroup>('/muscle-groups', { method: 'POST', body: { name } });

export const deleteMuscleGroup = (id: string): Promise<{ id: string }> =>
  apiRequest<{ id: string }>(`/muscle-groups/${id}`, { method: 'DELETE' });
