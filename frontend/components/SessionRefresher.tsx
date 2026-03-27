'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Silently refreshes the Supabase session when the user returns to the app
 * after a period of inactivity. Prevents the "send message and nothing happens"
 * bug that occurs when the JWT has expired while the tab was in the background.
 *
 * Placed in the root layout so it covers all pages.
 */
export function SessionRefresher() {
    const lastRefreshRef = useRef<number>(Date.now());
    const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — don't hammer Supabase

    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState !== 'visible') return;

            const now = Date.now();
            const elapsed = now - lastRefreshRef.current;

            // Only refresh if the tab was hidden long enough to risk expiry
            if (elapsed < MIN_REFRESH_INTERVAL_MS) return;

            lastRefreshRef.current = now;

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return; // Not logged in, nothing to refresh

                // Check if token is close to expiring (within 10 minutes)
                const expiresAt = session.expires_at ?? 0;
                const expiresInMs = expiresAt * 1000 - Date.now();
                const TEN_MINUTES_MS = 10 * 60 * 1000;

                if (expiresInMs < TEN_MINUTES_MS) {
                    console.info('[SessionRefresher] Token near expiry — refreshing silently...');
                    const { error } = await supabase.auth.refreshSession();
                    if (error) {
                        console.warn('[SessionRefresher] Silent refresh failed:', error.message);
                        // Don't redirect — let the 401 interceptor in api.ts handle it
                        // on the next actual API call
                    } else {
                        console.info('[SessionRefresher] Session refreshed successfully.');
                    }
                }
            } catch (err) {
                console.warn('[SessionRefresher] Error during visibility refresh:', err);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    return null; // renders nothing
}
