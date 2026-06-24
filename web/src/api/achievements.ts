import { apiRequest } from './client';
import type { Achievement } from '../types';

export function getAchievements(): Promise<Achievement[]> {
  return apiRequest<Achievement[]>('/achievements');
}
