'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import PersonalInformationModal from '@/components/PersonalInformationModal';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type ProfileResponse = {
    id?: string;
    full_name?: string | null;
    first_name?: string | null;
    other_names?: string | null;
    avatar_url?: string | null;
    university?: string | null;
    level?: string | null;
};

type GuardUser = {
    name?: string;
    firstName?: string;
    otherNames?: string;
    avatarUrl?: string;
    university?: string;
    level?: string;
};

const PUBLIC_ROUTES = new Set([
    '/',
    '/login',
    '/about',
    '/contact',
    '/faq',
    '/feedback',
    '/privacy',
    '/terms',
    '/download',
    '/reset-password',
]);

function isPublicPath(pathname: string | null): boolean {
    if (!pathname) return true;
    if (PUBLIC_ROUTES.has(pathname)) return true;
    return pathname.startsWith('/auth/callback');
}

function isProfileComplete(profile: ProfileResponse | null): boolean {
    if (!profile) return false;

    const fullName = ((profile.full_name || '').trim())
        || [profile.first_name, profile.other_names].filter(Boolean).join(' ').trim();
    const university = (profile.university || '').trim();
    const level = (profile.level || '').trim();

    return Boolean(fullName && university && level);
}

function buildGuardUser(profile: ProfileResponse | null, metadata: Record<string, unknown> | undefined): GuardUser {
    const readString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

    return {
        name: readString(profile?.full_name) || readString(metadata?.full_name),
        firstName: readString(profile?.first_name) || readString(metadata?.first_name),
        otherNames: readString(profile?.other_names) || readString(metadata?.other_names),
        avatarUrl: readString(profile?.avatar_url) || readString(metadata?.avatar_url),
        university: readString(profile?.university) || readString(metadata?.university),
        level: readString(profile?.level) || readString(metadata?.level),
    };
}

export default function ProfileGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isPublicRoute = useMemo(() => isPublicPath(pathname), [pathname]);

    const [checkingProfile, setCheckingProfile] = useState(!isPublicRoute);
    const [profileRequired, setProfileRequired] = useState(false);
    const [guardUser, setGuardUser] = useState<GuardUser>({
        name: '',
        firstName: '',
        otherNames: '',
        avatarUrl: '',
        university: '',
        level: '',
    });

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            if (isPublicRoute) {
                if (!cancelled) {
                    setCheckingProfile(false);
                    setProfileRequired(false);
                }
                return;
            }

            setCheckingProfile(true);

            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (!session?.user) {
                    if (!cancelled) {
                        setCheckingProfile(false);
                        setProfileRequired(false);
                    }
                    return;
                }

                const response = await api.get('/me/profile');
                if (!response.ok) {
                    throw new Error('Failed to fetch profile');
                }

                const profile = (await response.json()) as ProfileResponse | null;
                const nextUser = buildGuardUser(profile, session.user.user_metadata);
                const complete = isProfileComplete(profile);

                if (!cancelled) {
                    setGuardUser(nextUser);
                    setProfileRequired(!complete);
                    setCheckingProfile(false);
                }
            } catch (error) {
                console.error('Profile guard check failed:', error);
                if (!cancelled) {
                    setCheckingProfile(false);
                    setProfileRequired(false);
                }
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [isPublicRoute]);

    if (isPublicRoute) {
        return <>{children}</>;
    }

    if (checkingProfile) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (profileRequired) {
        return (
            <>
                <div className="fixed inset-0 bg-background" />
                <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
                    <PersonalInformationModal
                        isOpen={true}
                        onClose={() => { }}
                        user={guardUser}
                        onSave={(data) => {
                            if (data.name.trim() && data.university.trim() && data.level.trim()) {
                                setGuardUser((prev) => ({
                                    ...prev,
                                    name: data.name,
                                    firstName: data.firstName,
                                    otherNames: data.otherNames,
                                    university: data.university,
                                    level: data.level,
                                }));
                                setProfileRequired(false);
                            }
                        }}
                        onAvatarChange={(url) => {
                            setGuardUser((prev) => ({ ...prev, avatarUrl: url }));
                        }}
                    />
                </div>
            </>
        );
    }

    return <>{children}</>;
}
