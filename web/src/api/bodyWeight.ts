import { apiRequest } from './client';
import type { BodyWeightEntry } from '../types';

export type CreateBodyWeightInput = {
  weight: number;
  date?: string; // ISO — si no se envía, el backend usa now()
};

export type BodyWeightResponse = {
  entry: BodyWeightEntry;
  dayKey: string;
  updated: boolean; // true si actualizó la pesada existente del día
};

export function getBodyWeights(): Promise<BodyWeightEntry[]> {
  return apiRequest<BodyWeightEntry[]>('/body-weight');
}

export function createBodyWeight(input: CreateBodyWeightInput): Promise<BodyWeightResponse> {
  return apiRequest<BodyWeightResponse>('/body-weight', { method: 'POST', body: input });
}

export function deleteBodyWeight(id: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/body-weight/${id}`, { method: 'DELETE' });
}
