import { supabase } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
// Avoid using API_KEY unless specifically requested or for non-auth endpoints if needed, but the user snippet removed it effectively.
// However, in previous steps I added 'x-api-key'. I should keep it if the backend requires it.
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

interface FetchOptions extends RequestInit {
    headers?: Record<string, string>;
    signal?: AbortSignal;
}

export const api = {
    fetch: async (endpoint: string, options: FetchOptions = {}) => {
        // 1. Get current session token
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        // Debugging line
        console.log(`[API] Fetching ${endpoint} | Has Token: ${!!token}`);

        // 2. Prepare Headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY, // Keep for comprehensive auth
            ...options.headers,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // special handling for FormData
        if (options.body instanceof FormData) {
            delete headers['Content-Type']; // Let browser set multipart boundary
        } else if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        // 3. Make Request
        const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

        const response = await fetch(url, {
            ...options,
            headers,
        });

        // 4. Global Error Handling (Optional)
        if (response.status === 401) {
            console.warn("API request unauthorized - session might be expired or token missing.");
        }

        if (!response.ok) {
            const rawText = await response.clone().text();
            console.error(`[API Error] Status: ${response.status} ${response.statusText}`);
            console.error(`[API Error] Raw Body:`, rawText);
            try {
                const errorData = JSON.parse(rawText);
                console.error("API Error Details:", errorData);
            } catch {
                console.error("API Error (Non-JSON):", response.statusText);
            }
        }

        return response;
    },

    get: (endpoint: string, options: FetchOptions = {}) => {
        return api.fetch(endpoint, { ...options, method: 'GET' });
    },

    post: (endpoint: string, body: unknown, options: FetchOptions = {}) => {
        const isFormData = body instanceof FormData;
        return api.fetch(endpoint, {
            ...options,
            method: 'POST',
            body: isFormData ? body : JSON.stringify(body),
        });
    },

    delete: (endpoint: string, options: FetchOptions = {}) => {
        return api.fetch(endpoint, { ...options, method: 'DELETE' });
    }
};
