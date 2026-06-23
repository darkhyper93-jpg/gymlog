import { apiRequest } from './client';

type AuthResult = { token: string };

export function login(username: string, password: string): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

export function register(username: string, password: string): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/register', {
    method: 'POST',
    body: { username, password },
  });
}
