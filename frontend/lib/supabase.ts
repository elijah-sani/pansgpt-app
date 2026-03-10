import { createClient, type SupportedStorage, type SupabaseClient } from '@supabase/supabase-js';
import { get, set, del } from 'idb-keyval';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const STORAGE_KEY = 'pansgpt-auth';

let supabaseInstance: SupabaseClient;
type GlobalWithSupabase = typeof globalThis & { supabase?: SupabaseClient };
const globalWithSupabase = globalThis as GlobalWithSupabase;

// IndexedDB-backed storage via idb-keyval.
// Far more persistent than localStorage on mobile PWA —
// browsers (especially Safari iOS) aggressively evict localStorage
// for home-screen apps, causing session loss on reopen.
// idb-keyval survives app backgrounding, restarts, and low-memory eviction.
const idbStorage: SupportedStorage = {
  getItem: async (key) => {
    if (typeof window === 'undefined') return null;
    try {
      const value = await get<string>(key);
      return value ?? null;
    } catch {
      // Fallback to localStorage if IndexedDB is unavailable
      return window.localStorage.getItem(key);
    }
  },
  setItem: async (key, value) => {
    if (typeof window === 'undefined') return;
    try {
      await set(key, value);
    } catch {
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: async (key) => {
    if (typeof window === 'undefined') return;
    try {
      await del(key);
    } catch {
      window.localStorage.removeItem(key);
    }
  },
};

function createSupabaseBrowserClient() {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: STORAGE_KEY,
      storage: idbStorage,
    },
  });
}

if (supabaseUrl && supabaseKey) {
  if (process.env.NODE_ENV === 'production') {
    supabaseInstance = createSupabaseBrowserClient();
  } else {
    if (!globalWithSupabase.supabase) {
      globalWithSupabase.supabase = createSupabaseBrowserClient();
    }
    supabaseInstance = globalWithSupabase.supabase;
  }
} else {
  supabaseInstance = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { session: null, user: null }, error: null }),
      signUp: async () => ({ data: { session: null, user: null }, error: null }),
      updateUser: async () => ({ data: { user: null }, error: null }),
      resend: async () => ({ data: { user: null, session: null }, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
    },
    from: () => ({
      select: () => ({ data: null, error: null }),
      insert: () => ({ data: null, error: null }),
      update: () => ({ data: null, error: null }),
      delete: () => ({ data: null, error: null }),
      upsert: () => ({ data: null, error: null }),
    }),
  } as unknown as SupabaseClient;
}

export const supabase = supabaseInstance;