'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import MaintenanceScreen from './MaintenanceScreen';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export default function MaintenanceGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { maintenanceMode, loading: statusLoading } = useSystemStatus();
    const [isAdmin, setIsAdmin] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);

    // Initial Auth Check
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email) {
                const response = await api.get('/me/bootstrap');
                if (response.ok) {
                    const data = await response.json();
                    if (data?.is_admin) setIsAdmin(true);
                }
            }
            setAuthLoading(false);
        };
        checkAuth();
    }, []);

    // Loading State: We deleted `statusLoading` from this condition to make the app
    // render optimistically. Only if the status check finishes AND confirms maintenanceMode
    // is active, do we show the loading spinner (while waiting for admin auth check).
    if (maintenanceMode && authLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    const isExcludedRoute = pathname?.startsWith('/login') || pathname?.startsWith('/admin');

    if (maintenanceMode && !isAdmin && !isExcludedRoute) {
        return <MaintenanceScreen />;
    }

    return <>{children}</>;
}
