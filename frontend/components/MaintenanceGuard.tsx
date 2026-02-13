'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import MaintenanceScreen from './MaintenanceScreen';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { Loader2 } from 'lucide-react';

export default function MaintenanceGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { maintenanceMode, loading: statusLoading } = useSystemStatus();
    const [isAdmin, setIsAdmin] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Initial Auth Check
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email) {
                // Determine if admin
                const { data } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('email', session.user.email)
                    .single();

                if (data) setIsAdmin(true);
            }
            setAuthLoading(false);
        };
        checkAuth();
    }, [supabase]);

    // Loading State (Prevent flash of content)
    if (statusLoading || (maintenanceMode && authLoading)) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    // Logic: 
    // IF maintenance_mode is true
    // AND user is NOT logged in (or is a regular student - wait, user said "allows Admins". If session exists but role check failed, assumes student)
    // AND current path is NOT /login or /admin/...

    // Note: pathname can be null on first server render match, but this is client component.
    const isExcludedRoute = pathname?.startsWith('/login') || pathname?.startsWith('/admin');

    if (maintenanceMode && !isAdmin && !isExcludedRoute) {
        return <MaintenanceScreen />;
    }

    return <>{children}</>;
}
