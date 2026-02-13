'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import OnboardingModal from './OnboardingModal';

export default function ProfileGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const checkProfile = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (session?.user) {
                    setUser(session.user);

                    // Fetch profile
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('first_name, university, level')
                        .eq('id', session.user.id)
                        .single();

                    // Check if profile is incomplete
                    if (profile) {
                        if (!profile.first_name || !profile.university || !profile.level) {
                            setShowOnboarding(true);
                        }
                    } else {
                        // Profile missing completely? Should auto-create on signup ideally, but here we can treat as incomplete
                        setShowOnboarding(true);
                    }
                }
            } catch (error) {
                console.error("Profile check failed:", error);
            } finally {
                setLoading(false);
            }
        };

        checkProfile();
    }, [pathname]); // Re-check on nav? Or just once? 
    // If user completes modal, showOnboarding becomes false. 
    // If they navigate, we might want to ensure they can't bypass.
    // Putting pathname in dependency ensures check happens.

    // Exclude Auth routes
    const isAuthRoute = pathname?.startsWith('/login') || pathname?.startsWith('/auth') || pathname?.startsWith('/admin');

    if (loading) { // Optional: block until we know? Or let content load?
        // Blocking is safer to prevent flash of content then modal
        // But might delay TTI.
        // Let's render children but show modal on top if needed? 
        // No, if we want to FORCE, we should probably output children + modal.
        // But we need to know if we SHOULD show modal.
        // Let's just return children and modal if ready.
    }

    return (
        <>
            {children}
            {!isAuthRoute && showOnboarding && user && (
                <OnboardingModal
                    user={user}
                    onComplete={() => setShowOnboarding(false)}
                />
            )}
        </>
    );
}
