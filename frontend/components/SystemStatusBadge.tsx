'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function SystemStatusBadge() {
    const [status, setStatus] = useState<'online' | 'maintenance'>('online');

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const response = await api.get('/sys/status');
                if (!response.ok) return;
                const data = await response.json();
                setStatus(data?.maintenance_mode ? 'maintenance' : 'online');
            } catch (error) {
                console.error('Failed to fetch system status', error);
            }
        };

        fetchStatus();
    }, []);

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
