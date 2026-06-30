import { apiRequest } from './client';
import type { ImportRoutine, Routine } from '../types';

export const parseImport = (input: { file?: File; text?: string }): Promise<ImportRoutine> => {
  const fd = new FormData();
  if (input.file) fd.append('file', input.file);
  if (input.text) fd.append('text', input.text);
  return apiRequest<ImportRoutine>('/import/parse', { method: 'POST', body: fd });
};

export const commitImport = (routine: ImportRoutine): Promise<Routine> =>
  apiRequest<Routine>('/import/commit', { method: 'POST', body: routine });
