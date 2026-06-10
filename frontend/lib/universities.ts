import { api } from '@/lib/api';

export type UniversityOption = {
  id: string;
  name: string;
  short_name?: string | null;
  country?: string | null;
  state?: string | null;
  status?: string | null;
};

export function readUniversityErrorMessage(raw: unknown, fallback: string): string {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const detail = 'detail' in raw ? raw.detail : null;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  const message = 'message' in raw ? raw.message : null;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  return fallback;
}

export async function fetchActiveUniversities(): Promise<UniversityOption[]> {
  const response = await api.get('/universities');
  if (!response.ok) {
    const raw = await response.json().catch(() => null);
    throw new Error(readUniversityErrorMessage(raw, 'Unable to load universities right now. Please try again.'));
  }

  return (await response.json()) as UniversityOption[];
}
