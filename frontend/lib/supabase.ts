import { createClient, type SupportedStorage, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const STORAGE_KEY = 'pansgpt-auth';

let supabaseInstance: SupabaseClient;
type GlobalWithSupabase = typeof globalThis & { supabase?: SupabaseClient };
const globalWithSupabase = globalThis as GlobalWithSupabase;

// Synchronous localStorage-backed storage.
// IDB (IndexedDB) was tried but its async nature causes getSession() to
// resolve before the read completes, returning null and triggering
// incorrect redirects to /login throughout the app.
// localStorage is synchronous, always returns the session immediately,
// and persists fine on modern mobile PWA (iOS 16.4+, Android Chrome).
const browserStorage: SupportedStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};

// [DESKTOP AUTH PERSISTENCE] Disk-backed storage adapter via Electron IPC
const electronStorage: SupportedStorage = { // [DESKTOP AUTH PERSISTENCE]
  getItem: (key: string) => { // [DESKTOP AUTH PERSISTENCE]
    if (typeof window === 'undefined' || !(window as any).electronAPI?.getAuthItem) return null; // [DESKTOP AUTH PERSISTENCE]
    return (window as any).electronAPI.getAuthItem(key); // [DESKTOP AUTH PERSISTENCE]
  }, // [DESKTOP AUTH PERSISTENCE]
  setItem: (key: string, value: string) => { // [DESKTOP AUTH PERSISTENCE]
    if (typeof window === 'undefined' || !(window as any).electronAPI?.setAuthItem) return; // [DESKTOP AUTH PERSISTENCE]
    void (window as any).electronAPI.setAuthItem(key, value); // [DESKTOP AUTH PERSISTENCE]
  }, // [DESKTOP AUTH PERSISTENCE]
  removeItem: (key: string) => { // [DESKTOP AUTH PERSISTENCE]
    if (typeof window === 'undefined' || !(window as any).electronAPI?.removeAuthItem) return; // [DESKTOP AUTH PERSISTENCE]
    void (window as any).electronAPI.removeAuthItem(key); // [DESKTOP AUTH PERSISTENCE]
  }, // [DESKTOP AUTH PERSISTENCE]
}; // [DESKTOP AUTH PERSISTENCE]

function isElectronRuntime(): boolean { // [DESKTOP AUTH PERSISTENCE]
  return typeof window !== 'undefined' && Boolean((window as any).electronAPI); // [DESKTOP AUTH PERSISTENCE]
} // [DESKTOP AUTH PERSISTENCE]

function createSupabaseBrowserClient() {
  const activeStorage = isElectronRuntime() ? electronStorage : browserStorage; // [DESKTOP AUTH PERSISTENCE]
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: STORAGE_KEY,
      storage: activeStorage,
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