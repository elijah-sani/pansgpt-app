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

    // We deleted the loading spinner condition to make the app render optimistically.
    // If maintenanceMode is explicitly active and the user is NOT an admin, 
    // it will smoothly transition to the MaintenanceScreen below.

    const isExcludedRoute = pathname?.startsWith('/login') || pathname?.startsWith('/admin');

    if (maintenanceMode && !isAdmin && !isExcludedRoute) {
        return <MaintenanceScreen />;
    }

    return <>{children}</>;
}
