'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { resolveDestinationFromBootstrap } from '@/lib/bootstrap-routing';
import { fetchBootstrap } from '@/lib/bootstrap-cache';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
    const router = useRouter();
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        const handleCallback = async () => {
            const params = new URLSearchParams(window.location.search);
            const token_hash = params.get('token_hash');
            const type = params.get('type');
            const code = params.get('code');

            try {
                if (token_hash && type) {
                    const { error } = await supabase.auth.verifyOtp({
                        token_hash,
                        type: type as 'signup' | 'email' | 'recovery' | 'invite',
                    });
                    if (error) {
                        console.error('[auth/callback] verifyOtp failed:', error.message);
                        router.replace('/login?error=callback_failed');
                        return;
                    }
                } else if (code) {
                    const { error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) {
                        console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
                        router.replace('/login?error=callback_failed');
                        return;
                    }
                } else {
                    console.error('[auth/callback] No token_hash or code in URL');
                    router.replace('/login');
                    return;
                }

                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    console.error('[auth/callback] getUser failed:', userError?.message);
                    router.replace('/login?error=user_not_found');
                    return;
                }

                let shouldForceProfileCompletion = false;

                try {
                    const syncResponse = await api.post('/me/profile/sync', {});
                    if (!syncResponse.ok) {
                        console.error('[auth/callback] profile sync failed with status:', syncResponse.status);
                        shouldForceProfileCompletion = true;
                    } else {
                        const syncPayload = await syncResponse.json().catch(() => null);
                        if (!syncPayload?.data?.university_id) {
                            shouldForceProfileCompletion = true;
                        }
                    }
                } catch (syncError) {
                    console.error('[auth/callback] profile sync request failed:', syncError);
                    shouldForceProfileCompletion = true;
                }

                let callbackDestination = shouldForceProfileCompletion ? '/main?welcome=true&profile=1' : '/main?welcome=true';
                try {
                    const bootstrap = await fetchBootstrap({ force: true });
                    if (bootstrap?.is_lecturer) {
                        callbackDestination = resolveDestinationFromBootstrap(bootstrap);
                    }
                } catch (bootstrapError) {
                    console.warn('[auth/callback] bootstrap routing failed:', bootstrapError);
                }

                router.replace(callbackDestination);
            } catch (err) {
                console.error('[auth/callback] Unexpected error:', err);
                router.replace('/login?error=callback_failed');
            }
        };

        void handleCallback();
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Confirming your account...</p>
            </div>
        </div>
    );
}
