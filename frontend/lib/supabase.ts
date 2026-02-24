
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Value to hold the Supabase client
let supabaseInstance: SupabaseClient;
type GlobalWithSupabase = typeof globalThis & { supabase?: SupabaseClient };
const globalWithSupabase = globalThis as GlobalWithSupabase;

// Guard against missing env vars (e.g. during Next.js static build)
if (supabaseUrl && supabaseKey) {
    if (process.env.NODE_ENV === 'production') {
        supabaseInstance = createBrowserClient(supabaseUrl, supabaseKey);
    } else {
        // In development, use a global variable so that the value
        // is preserved across module reloads caused by HMR (Hot Module Replacement).
        if (!globalWithSupabase.supabase) {
            globalWithSupabase.supabase = createBrowserClient(supabaseUrl, supabaseKey);
        }
        supabaseInstance = globalWithSupabase.supabase;
    }
} else {
    // Create a placeholder that will fail gracefully during build/SSG
    supabaseInstance = {
        auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
            signOut: async () => ({ error: null }),
            signInWithPassword: async () => ({ data: { session: null, user: null }, error: null }),
            signUp: async () => ({ data: { session: null, user: null }, error: null }),
        },
        from: () => ({
            select: () => ({ data: null, error: null }),
            insert: () => ({ data: null, error: null }),
            update: () => ({ data: null, error: null }),
            delete: () => ({ data: null, error: null }),
        }),
    } as unknown as SupabaseClient;
}

export const supabase = supabaseInstance;
