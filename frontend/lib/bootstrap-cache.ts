import { api } from '@/lib/api';
import type { BootstrapRouteResponse } from '@/lib/bootstrap-routing';

type BootstrapProfile = {
  avatar_url?: string | null;
  first_name?: string | null;
  full_name?: string | null;
  has_seen_welcome?: boolean | null;
  level?: string | null;
  other_names?: string | null;
  subscription_tier?: string | null;
  university?: string | null;
};

type BootstrapPayload = BootstrapRouteResponse & {
  profile?: BootstrapProfile | null;
  system_settings?: Record<string, unknown> | null;
  lecturer_profile?: Record<string, unknown> | null;
  file_count?: number;
};

const BOOTSTRAP_CACHE_TTL_MS = 10_000;

let bootstrapCache:
  | {
      value: BootstrapPayload | null;
      expiresAt: number;
    }
  | null = null;

let bootstrapInFlight: Promise<BootstrapPayload | null> | null = null;

export async function fetchBootstrap(options: { force?: boolean } = {}): Promise<BootstrapPayload | null> {
  const now = Date.now();

  if (!options.force && bootstrapCache && bootstrapCache.expiresAt > now) {
    return bootstrapCache.value;
  }

  if (!options.force && bootstrapInFlight) {
    return bootstrapInFlight;
  }

  bootstrapInFlight = (async () => {
    try {
      const response = await api.get('/me/bootstrap');
      if (!response.ok) {
        bootstrapCache = {
          value: null,
          expiresAt: Date.now() + 2_000,
        };
        return null;
      }

      const payload = (await response.json()) as BootstrapPayload;
      bootstrapCache = {
        value: payload,
        expiresAt: Date.now() + BOOTSTRAP_CACHE_TTL_MS,
      };
      return payload;
    } finally {
      bootstrapInFlight = null;
    }
  })();

  return bootstrapInFlight;
}

export function clearBootstrapCache() {
  bootstrapCache = null;
  bootstrapInFlight = null;
}
