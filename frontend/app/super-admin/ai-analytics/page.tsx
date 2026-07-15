'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
    Activity,
    BarChart3,
    Bot,
    Building2,
    ChevronDown,
    Clock,
    Cpu,
    Layers,
    RefreshCcw,
    Zap,
} from 'lucide-react';

import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type TokenBucket = {
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    provider?: string;
};

type Totals = {
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    avg_latency_ms: number | null;
    by_status: Record<string, number>;
};

type DailyPoint = {
    date: string;
    requests: number;
    total_tokens: number;
};

type AnalyticsData = {
    period_days: number;
    university_id: string | null;
    universities: Array<{ id: string; name: string; short_name?: string | null }>;
    totals: Totals;
    by_model: Record<string, TokenBucket>;
    by_provider: Record<string, TokenBucket>;
    by_request_type: Record<string, TokenBucket>;
    daily_series: DailyPoint[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

function pct(value: number, total: number): string {
    if (!total) return '0%';
    return `${((value / total) * 100).toFixed(1)}%`;
}

const PROVIDER_COLORS: Record<string, string> = {
    google: '#4285F4',
    groq: '#F97316',
    openrouter: '#8B5CF6',
    unknown: '#6B7280',
};

const DAYS_OPTIONS = [7, 14, 30, 60, 90, 365];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
    icon: Icon,
    label,
    value,
    sub,
    accent,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    sub?: string;
    accent?: string;
}) {
    return (
        <div
            className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
            style={accent ? { borderTopColor: accent, borderTopWidth: 3 } : undefined}
        >
            <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
    );
}

function BreakdownRow({
    label,
    value,
    total,
    color,
}: {
    label: string;
    value: number;
    total: number;
    color?: string;
}) {
    const ratio = total > 0 ? value / total : 0;
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
                <span className="truncate font-mono text-xs text-foreground/80 max-w-[60%]">{label}</span>
                <span className="text-muted-foreground text-xs">{fmt(value)} ({pct(value, total)})</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(ratio * 100).toFixed(1)}%`, background: color ?? '#6366f1' }}
                />
            </div>
        </div>
    );
}

function DailyChart({ series, days }: { series: DailyPoint[]; days: number }) {
    if (!series.length) {
        return (
            <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                No data for this period
            </div>
        );
    }

    const maxRequests = Math.max(...series.map((d) => d.requests), 1);
    // Only show the last N days worth of bars (avoid overcrowding)
    const visible = series.slice(-Math.min(days, 60));

    return (
        <div className="flex h-36 items-end gap-[2px] overflow-x-auto pb-1">
            {visible.map((point) => {
                const h = Math.max(4, Math.round((point.requests / maxRequests) * 128));
                return (
                    <div
                        key={point.date}
                        className="group relative flex shrink-0 flex-col items-center"
                        style={{ width: `${Math.max(8, Math.floor(560 / visible.length))}px` }}
                    >
                        <div
                            className="w-full cursor-default rounded-t-sm bg-indigo-500/70 transition-colors group-hover:bg-indigo-400"
                            style={{ height: `${h}px` }}
                        />
                        {/* Tooltip */}
                        <div className="pointer-events-none absolute bottom-full mb-2 hidden w-36 rounded-lg border border-border bg-popover px-2 py-1.5 text-xs shadow-lg group-hover:block z-10">
                            <p className="font-semibold text-foreground">{point.date}</p>
                            <p className="text-muted-foreground">{fmt(point.requests)} requests</p>
                            <p className="text-muted-foreground">{fmt(point.total_tokens)} tokens</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperAdminAIAnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUniversity, setSelectedUniversity] = useState<string>('');
    const [selectedDays, setSelectedDays] = useState<number>(30);

    const fetchAnalytics = useCallback(async (universityId: string, days: number) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ days: String(days) });
            if (universityId) params.set('university_id', universityId);
            const response = await api.get(`/admin/ai-analytics?${params}`);
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error((body as { detail?: string }).detail ?? `Request failed (${response.status})`);
            }
            const result = (await response.json()) as AnalyticsData;
            setData(result);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchAnalytics(selectedUniversity, selectedDays);
    }, [fetchAnalytics, selectedUniversity, selectedDays]);

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6">

            {/* ── Filters + Refresh ── */}
            <section className="flex flex-wrap items-center gap-3">
                {/* University filter */}
                <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <select
                        id="ai-analytics-university-filter"
                        value={selectedUniversity}
                        onChange={(e) => setSelectedUniversity(e.target.value)}
                        className="h-9 appearance-none rounded-lg border border-border bg-background pl-8 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">All Universities</option>
                        {(data?.universities ?? []).map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.short_name ?? u.name}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>

                {/* Days filter */}
                <div className="relative">
                    <Clock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <select
                        id="ai-analytics-days-filter"
                        value={selectedDays}
                        onChange={(e) => setSelectedDays(Number(e.target.value))}
                        className="h-9 appearance-none rounded-lg border border-border bg-background pl-8 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        {DAYS_OPTIONS.map((d) => (
                            <option key={d} value={d}>Last {d} days</option>
                        ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>

                {selectedUniversity && data && (
                    <span className="text-xs text-muted-foreground">
                        Filtered: {data.universities.find((u) => u.id === selectedUniversity)?.name ?? selectedUniversity}
                    </span>
                )}

                <button
                    id="ai-analytics-refresh-btn"
                    onClick={() => void fetchAnalytics(selectedUniversity, selectedDays)}
                    disabled={loading}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
                >
                    <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </section>

            {/* ── Error ── */}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
                    {error}
                </div>
            )}

            {/* ── Skeleton ── */}
            {loading && !data && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
                    ))}
                </div>
            )}

            {/* ── Content ── */}
            {data && (
                <>
                    {/* KPI cards */}
                    <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                        <StatCard
                            icon={Zap}
                            label="Total Requests"
                            value={fmt(data.totals.requests)}
                            sub={`last ${data.period_days} days`}
                            accent="#6366f1"
                        />
                        <StatCard
                            icon={Layers}
                            label="Total Tokens"
                            value={fmt(data.totals.total_tokens)}
                            sub={`${fmt(data.totals.prompt_tokens)} in · ${fmt(data.totals.completion_tokens)} out`}
                            accent="#10b981"
                        />
                        <StatCard
                            icon={Clock}
                            label="Avg Latency"
                            value={data.totals.avg_latency_ms != null ? `${data.totals.avg_latency_ms.toFixed(0)} ms` : '—'}
                            sub="per non-streaming call"
                            accent="#f59e0b"
                        />
                        <StatCard
                            icon={Activity}
                            label="Success Rate"
                            value={pct(data.totals.by_status['success'] ?? 0, data.totals.requests)}
                            sub={`${data.totals.by_status['error'] ?? 0} errors · ${data.totals.by_status['timeout'] ?? 0} timeouts`}
                            accent="#22c55e"
                        />
                    </section>

                    {/* Daily bar chart */}
                    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-indigo-500" />
                            <h2 className="text-sm font-semibold">Daily Requests</h2>
                            <span className="ml-auto text-xs text-muted-foreground">Hover bars for details</span>
                        </div>
                        <DailyChart series={data.daily_series} days={data.period_days} />
                    </section>

                    {/* Breakdown grid */}
                    <div className="grid gap-5 md:grid-cols-3">

                        {/* By provider */}
                        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                            <div className="mb-4 flex items-center gap-2">
                                <Cpu className="h-4 w-4 text-violet-500" />
                                <h2 className="text-sm font-semibold">By Provider</h2>
                            </div>
                            <div className="space-y-3">
                                {Object.entries(data.by_provider)
                                    .sort((a, b) => b[1].requests - a[1].requests)
                                    .map(([prov, bucket]) => (
                                        <BreakdownRow
                                            key={prov}
                                            label={prov}
                                            value={bucket.requests}
                                            total={data.totals.requests}
                                            color={PROVIDER_COLORS[prov] ?? '#6366f1'}
                                        />
                                    ))}
                                {!Object.keys(data.by_provider).length && (
                                    <p className="text-xs text-muted-foreground">No data yet</p>
                                )}
                            </div>
                        </div>

                        {/* By request type */}
                        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                            <div className="mb-4 flex items-center gap-2">
                                <Bot className="h-4 w-4 text-amber-500" />
                                <h2 className="text-sm font-semibold">By Request Type</h2>
                            </div>
                            <div className="space-y-3">
                                {Object.entries(data.by_request_type)
                                    .sort((a, b) => b[1].requests - a[1].requests)
                                    .map(([rt, bucket]) => (
                                        <BreakdownRow
                                            key={rt}
                                            label={rt}
                                            value={bucket.requests}
                                            total={data.totals.requests}
                                            color="#f59e0b"
                                        />
                                    ))}
                                {!Object.keys(data.by_request_type).length && (
                                    <p className="text-xs text-muted-foreground">No data yet</p>
                                )}
                            </div>
                        </div>

                        {/* By model */}
                        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                            <div className="mb-4 flex items-center gap-2">
                                <Activity className="h-4 w-4 text-emerald-500" />
                                <h2 className="text-sm font-semibold">By Model</h2>
                            </div>
                            <div className="space-y-3">
                                {Object.entries(data.by_model)
                                    .sort((a, b) => b[1].requests - a[1].requests)
                                    .map(([model, bucket]) => (
                                        <BreakdownRow
                                            key={model}
                                            label={model.split('/').pop() ?? model}
                                            value={bucket.requests}
                                            total={data.totals.requests}
                                            color={PROVIDER_COLORS[bucket.provider ?? 'unknown'] ?? '#10b981'}
                                        />
                                    ))}
                                {!Object.keys(data.by_model).length && (
                                    <p className="text-xs text-muted-foreground">No data yet</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Model token table */}
                    <section className="overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-sm">
                        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                            <Layers className="h-4 w-4 text-indigo-400" />
                            <h2 className="text-sm font-semibold">Token Usage by Model</h2>
                        </div>
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                                    <th className="px-5 py-3 text-left font-medium">Model</th>
                                    <th className="px-5 py-3 text-left font-medium">Provider</th>
                                    <th className="px-5 py-3 text-right font-medium">Requests</th>
                                    <th className="px-5 py-3 text-right font-medium">Prompt Tokens</th>
                                    <th className="px-5 py-3 text-right font-medium">Completion Tokens</th>
                                    <th className="px-5 py-3 text-right font-medium">Total Tokens</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {Object.entries(data.by_model)
                                    .sort((a, b) => b[1].total_tokens - a[1].total_tokens)
                                    .map(([model, bucket]) => (
                                        <tr key={model} className="hover:bg-muted/40 transition-colors">
                                            <td className="px-5 py-3 font-mono text-xs max-w-[220px] truncate">{model}</td>
                                            <td className="px-5 py-3">
                                                <span
                                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                                    style={{ background: PROVIDER_COLORS[bucket.provider ?? 'unknown'] }}
                                                >
                                                    {bucket.provider ?? 'unknown'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-right tabular-nums">{fmt(bucket.requests)}</td>
                                            <td className="px-5 py-3 text-right tabular-nums">{fmt(bucket.prompt_tokens)}</td>
                                            <td className="px-5 py-3 text-right tabular-nums">{fmt(bucket.completion_tokens)}</td>
                                            <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmt(bucket.total_tokens)}</td>
                                        </tr>
                                    ))}
                                {!Object.keys(data.by_model).length && (
                                    <tr>
                                        <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                                            No usage data recorded yet for this period.
                                            <br />
                                            <span className="text-xs">Run the SQL migration and send a few chat requests to start seeing data.</span>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </section>
                </>
            )}
        </div>
    );
}

