
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Value to hold the Supabase client
let supabaseInstance: SupabaseClient;
type GlobalWithSupabase = typeof globalThis & { supabase?: SupabaseClient };
const globalWithSupabase = globalThis as GlobalWithSupabase;

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

export const supabase = supabaseInstance;
