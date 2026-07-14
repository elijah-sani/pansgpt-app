'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Database,
    HeartPulse,
    Route,
    Settings,
    ShieldAlert,
    XCircle,
} from 'lucide-react';

import { api } from '@/lib/api';

type HealthItem = {
    label: string;
    ok: boolean;
    detail: string;
};

type CounterMap = Record<string, number>;

type MetricsBucket = {
    events_total: number;
    blocked_total: number;
    blocked_output_total: number;
    by_event_type: CounterMap;
    by_category: CounterMap;
    by_route: CounterMap;
    by_decision: CounterMap;
    by_severity: CounterMap;
    by_matched_rule: CounterMap;
};

type SecurityMetricsSnapshot = {
    storage: string;
    last_updated_at: string | null;
    totals: MetricsBucket;
    daily: Record<string, MetricsBucket>;
    alerts: Array<{
        id: string;
        severity: 'low' | 'medium' | 'high' | string;
        title: string;
        detail: string;
        threshold: number;
        current_value: number;
        scope: string;
    }>;
};

const EMPTY_BUCKET: MetricsBucket = {
    events_total: 0,
    blocked_total: 0,
    blocked_output_total: 0,
    by_event_type: {},
    by_category: {},
    by_route: {},
    by_decision: {},
    by_severity: {},
    by_matched_rule: {},
};

function formatTimestamp(value: string | null): string {
    if (!value) return 'No events recorded yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function topEntries(source: CounterMap, limit: number = 4): Array<{ label: string; value: number }> {
    return Object.entries(source)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([label, value]) => ({ label, value }));
}

function latestDayLabel(daily: Record<string, MetricsBucket>): string | null {
    const keys = Object.keys(daily).sort();
    return keys.length ? keys[keys.length - 1] : null;
}

function StatCard({
    label,
    value,
    detail,
    icon,
    tint,
}: {
    label: string;
    value: string;
    detail: string;
    icon: React.ReactNode;
    tint: string;
}) {
    return (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className={`rounded-xl p-2.5 ${tint}`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}

function TopList({
    title,
    emptyText,
    entries,
}: {
    title: string;
    emptyText: string;
    entries: Array<{ label: string; value: number }>;
}) {
    return (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <div className="mt-4 space-y-3">
                {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{emptyText}</p>
                ) : entries.map((entry) => (
                    <div key={entry.label} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-4 py-3">
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">{entry.label}</span>
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{entry.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function SuperAdminSystemHealthPage() {
    const [items, setItems] = useState<HealthItem[]>([]);
    const [metrics, setMetrics] = useState<SecurityMetricsSnapshot | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            const checks = [
                { label: 'Universities API', endpoint: '/admin/universities' },
                { label: 'Admin Roles API', endpoint: '/admin/users' },
                { label: 'Global AI Configuration', endpoint: '/admin/config' },
                { label: 'Feedback API', endpoint: '/admin/feedback' },
            ];

            const [healthResults, metricsResponse] = await Promise.all([
                Promise.all(
                    checks.map(async (check) => {
                        try {
                            const response = await api.get(check.endpoint);
                            return {
                                label: check.label,
                                ok: response.ok,
                                detail: response.ok ? 'Reachable' : `Returned ${response.status}`,
                            } satisfies HealthItem;
                        } catch (err) {
                            return {
                                label: check.label,
                                ok: false,
                                detail: err instanceof Error ? err.message : 'Request failed',
                            } satisfies HealthItem;
                        }
                    })
                ),
                api.get('/admin/config/security-metrics').catch((err) => err),
            ]);

            setItems(healthResults);

            if (metricsResponse instanceof Error) {
                setMetrics(null);
            } else if (metricsResponse.ok) {
                const payload = await metricsResponse.json();
                setMetrics({
                    storage: payload.storage || 'unknown',
                    last_updated_at: payload.last_updated_at || null,
                    totals: payload.totals || EMPTY_BUCKET,
                    daily: payload.daily || {},
                    alerts: payload.alerts || [],
                });
            } else {
                setMetrics(null);
            }

            setIsLoading(false);
        };
        void load();
    }, []);

    const healthy = items.filter((item) => item.ok).length;
    const totals = metrics?.totals || EMPTY_BUCKET;
    const latestDay = latestDayLabel(metrics?.daily || {});
    const latestBucket = latestDay ? metrics?.daily[latestDay] || EMPTY_BUCKET : EMPTY_BUCKET;

    const topCategories = useMemo(() => topEntries(totals.by_category), [totals.by_category]);
    const topRoutes = useMemo(() => topEntries(totals.by_route), [totals.by_route]);
    const topMatchedRules = useMemo(() => topEntries(totals.by_matched_rule), [totals.by_matched_rule]);
    const alerts = metrics?.alerts || [];
    const dailyRows = useMemo(
        () =>
            Object.entries(metrics?.daily || {})
                .sort((a, b) => b[0].localeCompare(a[0]))
                .slice(0, 7),
        [metrics?.daily]
    );

    return (
        <div className="mx-auto w-full max-w-6xl space-y-8">
            <header>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Platform Support</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">System Health</h1>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    Basic endpoint reachability plus a live view of blocked LLM attack patterns, top affected routes, and leak-filter activity.
                </p>
            </header>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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

                <div className="grid gap-3 md:grid-cols-2">
                    {isLoading ? (
                        <p className="md:col-span-2 py-16 text-center text-sm text-muted-foreground">Checking platform services...</p>
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

            <section className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight text-foreground">AI Security Visibility</h2>
                        <p className="text-sm text-muted-foreground">
                            Metrics come from in-memory security counters and reset when the backend process restarts.
                        </p>
                    </div>
                    <div className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        Last update: {formatTimestamp(metrics?.last_updated_at || null)}
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Security Events"
                        value={String(totals.events_total)}
                        detail={`${totals.by_event_type.policy_block || 0} request-time blocks recorded`}
                        icon={<ShieldAlert className="h-5 w-5" />}
                        tint="bg-amber-500/10 text-amber-600"
                    />
                    <StatCard
                        label="Blocked Requests"
                        value={String(totals.blocked_total)}
                        detail={`${totals.by_category.prompt_extraction || 0} prompt-extraction attempts so far`}
                        icon={<AlertTriangle className="h-5 w-5" />}
                        tint="bg-rose-500/10 text-rose-600"
                    />
                    <StatCard
                        label="Leak Filter Blocks"
                        value={String(totals.blocked_output_total)}
                        detail={`${totals.by_event_type.output_leak_block || 0} output leak activations`}
                        icon={<Activity className="h-5 w-5" />}
                        tint="bg-sky-500/10 text-sky-600"
                    />
                    <StatCard
                        label="Active Routes"
                        value={String(Object.keys(totals.by_route).length)}
                        detail={latestDay ? `${latestDay}: ${latestBucket.events_total} events` : 'No route activity yet'}
                        icon={<Route className="h-5 w-5" />}
                        tint="bg-emerald-500/10 text-emerald-600"
                    />
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Active Alerts</h3>
                            <p className="text-xs text-muted-foreground">
                                Threshold-based warnings derived from the latest daily metrics bucket.
                            </p>
                        </div>
                        <div className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-600">
                            {alerts.length} active
                        </div>
                    </div>

                    {alerts.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                            No active alert thresholds are currently triggered.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {alerts.map((alert) => {
                                const tone =
                                    alert.severity === 'high'
                                        ? 'border-rose-500/30 bg-rose-500/5 text-rose-700'
                                        : alert.severity === 'medium'
                                            ? 'border-amber-500/30 bg-amber-500/5 text-amber-700'
                                            : 'border-sky-500/30 bg-sky-500/5 text-sky-700';

                                return (
                                    <div key={alert.id} className={`rounded-xl border px-4 py-4 ${tone}`}>
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold">{alert.title}</p>
                                                <p className="mt-1 text-sm">{alert.detail}</p>
                                            </div>
                                            <div className="text-right text-xs font-semibold uppercase tracking-[0.14em]">
                                                <div>{alert.severity}</div>
                                                <div className="mt-1 normal-case tracking-normal text-current/80">
                                                    {alert.current_value} / {alert.threshold}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                    <TopList
                        title="Top Attack Categories"
                        emptyText="No blocked categories recorded yet."
                        entries={topCategories}
                    />
                    <TopList
                        title="Top Affected Routes"
                        emptyText="No route activity recorded yet."
                        entries={topRoutes}
                    />
                    <TopList
                        title="Matched Rules"
                        emptyText="No rule matches recorded yet."
                        entries={topMatchedRules}
                    />
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Daily Activity</h3>
                            <p className="text-xs text-muted-foreground">
                                Rolling snapshot of recent security-counter buckets by day.
                            </p>
                        </div>
                        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                            Storage: {metrics?.storage || 'unknown'}
                        </div>
                    </div>

                    {dailyRows.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                            No security events have been captured yet.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dailyRows.map(([day, bucket]) => (
                                <div key={day} className="grid gap-3 rounded-xl border border-border bg-background p-4 md:grid-cols-5">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Day</p>
                                        <p className="mt-1 text-sm font-semibold text-foreground">{day}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Events</p>
                                        <p className="mt-1 text-sm font-semibold text-foreground">{bucket.events_total}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Blocked</p>
                                        <p className="mt-1 text-sm font-semibold text-foreground">{bucket.blocked_total}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Leak Blocks</p>
                                        <p className="mt-1 text-sm font-semibold text-foreground">{bucket.blocked_output_total}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Top Category</p>
                                        <p className="mt-1 text-sm font-semibold text-foreground">
                                            {topEntries(bucket.by_category, 1)[0]?.label || 'None'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-muted-foreground shadow-sm">
                    <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                            <Settings className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                            <p className="font-semibold text-foreground">Current scope</p>
                            <p>
                                This panel is fed by the live security metrics endpoint. It shows current posture without shell access, but it does not yet persist historical events or prompt-config change history across restarts.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
