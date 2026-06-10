'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Database, HeartPulse, Settings, XCircle } from 'lucide-react';

import { api } from '@/lib/api';

type HealthItem = {
    label: string;
    ok: boolean;
    detail: string;
};

export default function SuperAdminSystemHealthPage() {
    const [items, setItems] = useState<HealthItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            const nextItems: HealthItem[] = [];
            const checks = [
                { label: 'Universities API', endpoint: '/admin/universities', icon: Database },
                { label: 'Admin Roles API', endpoint: '/admin/users', icon: Database },
                { label: 'Global AI Configuration', endpoint: '/admin/config', icon: Settings },
                { label: 'Feedback API', endpoint: '/admin/feedback', icon: HeartPulse },
            ];
            for (const check of checks) {
                try {
                    const response = await api.get(check.endpoint);
                    nextItems.push({
                        label: check.label,
                        ok: response.ok,
                        detail: response.ok ? 'Reachable' : `Returned ${response.status}`,
                    });
                } catch (err) {
                    nextItems.push({
                        label: check.label,
                        ok: false,
                        detail: err instanceof Error ? err.message : 'Request failed',
                    });
                }
            }
            setItems(nextItems);
            setIsLoading(false);
        };
        void load();
    }, []);

    const healthy = items.filter((item) => item.ok).length;

    return (
        <div className="mx-auto w-full max-w-5xl space-y-8">
            <header>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Platform Support</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">System Health</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Lightweight checks for existing platform endpoints. Deeper infrastructure analytics can come later.
                </p>
            </header>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-6 flex items-center gap-3 border-b border-border pb-5">
                    <div className="rounded-lg bg-rose-500/10 p-2 text-rose-500">
                        <HeartPulse className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-semibold">Endpoint Status</h2>
                        <p className="text-xs text-muted-foreground">
                            {isLoading ? 'Running checks...' : `${healthy} of ${items.length} checks reachable`}
                        </p>
                    </div>
                </div>

                <div className="grid gap-3">
                    {isLoading ? (
                        <p className="py-16 text-center text-sm text-muted-foreground">Checking platform services...</p>
                    ) : items.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-4">
                            <div>
                                <h3 className="font-semibold">{item.label}</h3>
                                <p className="text-xs text-muted-foreground">{item.detail}</p>
                            </div>
                            {item.ok ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : (
                                <XCircle className="h-5 w-5 text-destructive" />
                            )}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
