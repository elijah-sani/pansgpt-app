import { supabase } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

interface FetchOptions extends RequestInit {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    _isRetry?: boolean; // internal flag to prevent infinite retry loops
}

async function buildHeaders(options: FetchOptions, token?: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        ...options.headers,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (options.body instanceof FormData) delete headers['Content-Type'];
    return headers;
}

/** Wait ms milliseconds before resolving. */
function delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function handleExpiredSession(): Promise<void> {
    console.warn('[API] Session expired - attempting one final refresh before redirect...');

    // Give the network 2 seconds to recover and try one more refresh
    await delay(2000);
    const { data: retryData } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null }, error: null }));

    if (retryData?.session) {
        // Recovered - dispatch an event so auth listeners update
        console.info('[API] Session recovered on second attempt.');
        window.dispatchEvent(new CustomEvent('pansgpt-token-refreshed'));
        return;
    }

    // Truly dead - sign out and redirect
    console.warn('[API] Session confirmed expired - signing out and redirecting to login.');
    await supabase.auth.signOut();
    window.location.replace('/login');
}

export const api = {
    fetch: async (endpoint: string, options: FetchOptions = {}): Promise<Response> => {
        // 1. Get current session
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        // 2. Build headers + make request
        const headers = await buildHeaders(options, token);
        const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

        const response = await fetch(url, { ...options, headers });

        // Only try a refresh when the request was actually authenticated.
        if (response.status === 401 && !options._isRetry) {
            if (!token) {
                console.warn(`[API] 401 received without a session token for ${endpoint}; skipping refresh/redirect.`);
                return response;
            }

            console.warn('[API] 401 received - attempting session refresh...');
            const { data, error } = await supabase.auth.refreshSession();

            if (error || !data.session) {
                await handleExpiredSession();
                return new Response(
                    JSON.stringify({ detail: 'Your session has expired. Please log in again.' }),
                    { status: 401, headers: { 'Content-Type': 'application/json' } }
                );
            }

            console.info('[API] Session refreshed - retrying request...');
            const retryHeaders = await buildHeaders(options, data.session.access_token);
            return fetch(url, { ...options, headers: retryHeaders });
        }

        // 4. Log non-OK responses for debugging (never expose raw errors to UI)
        if (!response.ok) {
            const rawText = await response.clone().text();
            console.error(`[API Error] ${response.status} ${response.statusText} - ${endpoint}`);
            try {
                console.error('[API Error] Details:', JSON.parse(rawText));
            } catch {
                console.error('[API Error] Raw:', rawText);
            }
        }

        return response;
    },

    get: (endpoint: string, options: FetchOptions = {}) =>
        api.fetch(endpoint, { ...options, method: 'GET' }),

    post: (endpoint: string, body: unknown, options: FetchOptions = {}) => {
        const isFormData = body instanceof FormData;
        return api.fetch(endpoint, {
            ...options,
            method: 'POST',
            body: isFormData ? body : JSON.stringify(body),
        });
    },

    patch: (endpoint: string, body: unknown, options: FetchOptions = {}) => {
        const isFormData = body instanceof FormData;
        return api.fetch(endpoint, {
            ...options,
            method: 'PATCH',
            body: isFormData ? body : JSON.stringify(body),
        });
    },

    delete: (endpoint: string, options: FetchOptions = {}) =>
        api.fetch(endpoint, { ...options, method: 'DELETE' }),
};
