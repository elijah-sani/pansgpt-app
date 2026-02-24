'use client';

import React, { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';

export function SystemStatusBadge() {
    const [status, setStatus] = useState<'online' | 'maintenance'>('online');

    // Create client once
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        const fetchStatus = async () => {
            const { data } = await supabase
                .from('system_settings')
                .select('maintenance_mode')
                .eq('id', 1)
                .single();

            if (data?.maintenance_mode) {
                setStatus('maintenance');
            } else {
                setStatus('online');
            }
        };

        fetchStatus();

        // Optional: Subscribe to changes for realtime updates
        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'system_settings',
                    filter: 'id=eq.1',
                },
                (payload) => {
                    const newMode = payload.new.maintenance_mode;
                    setStatus(newMode ? 'maintenance' : 'online');
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase]);

    if (status === 'maintenance') {
        return (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">Maintenance Mode</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-card border border-border">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">System Online</span>
        </div>
    );
}
