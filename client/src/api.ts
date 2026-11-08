export type Voice = { id: string; name: string; isPreset: boolean };
export type Job = {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  error: string | null;
  audioUrl: string | null;
};

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const tokenKey = 'versevoice-session-token';

export function getSessionToken(): string | null {
  return sessionStorage.getItem(tokenKey);
}

export function setSessionToken(token: string | null): void {
  if (token) sessionStorage.setItem(tokenKey, token);
  else sessionStorage.removeItem(tokenKey);
}

async function request<T>(path: string, init?: RequestInit, authenticated = false): Promise<T> {
  let response: Response;
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  if (authenticated) {
    const token = getSessionToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new Error('The server may be waking up. Try again shortly.');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const demoApi = {
  voices: () => request<Voice[]>('/api/demo/voices'),
  generate: (input: { voiceId: string; text: string; lineGapMs: number }) =>
    request<Job>('/api/demo/generate', { method: 'POST', body: JSON.stringify(input) }),
  job: (id: string) => request<Job>(`/api/demo/jobs/${encodeURIComponent(id)}`),
};

export const studioApi = {
  register: (input: { email: string; password: string }) => request<{ token: string; user: { id: string; email: string } }>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) => request<{ token: string; user: { id: string; email: string } }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  me: () => request<{ id: string; email: string }>('/api/auth/me', undefined, true),
  voices: () => request<Voice[]>('/api/voices', undefined, true),
  uploadVoice: (form: FormData) => request<Voice>('/api/voices', { method: 'POST', body: form }, true),
  removeVoice: (id: string) => request<void>(`/api/voices/${encodeURIComponent(id)}`, { method: 'DELETE' }, true),
  jobs: () => request<Job[]>('/api/jobs', undefined, true),
  generate: (input: { voiceId: string; text: string; lineGapMs: number }) => request<Job>('/api/jobs', { method: 'POST', body: JSON.stringify(input) }, true),
  job: (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}`, undefined, true),
};