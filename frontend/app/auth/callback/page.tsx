'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
                    // OTP flow — runs client-side so session goes into localStorage
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
                    // PKCE flow
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

                // Profile is created automatically by the on_auth_user_created
                // database trigger — no client-side upsert needed.
                router.replace('/main?welcome=true');
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