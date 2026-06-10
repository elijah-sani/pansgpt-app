'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCcw, Search, ShieldAlert, X } from 'lucide-react';
import { api } from '@/lib/api';

type RestrictionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

type RestrictionRecord = {
    id: string;
    title: string | null;
    course_code: string | null;
    course_title: string | null;
    level: string | null;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
    status: RestrictionStatus;
    lecturer_name: string | null;
    university_name: string | null;
    created_at: string | null;
    cancelled_by: string | null;
    cancelled_at: string | null;
};

type RestrictionsResponse = {
    data: RestrictionRecord[];
};

const STATUS_CLASSES: Record<RestrictionStatus, string> = {
    active: 'border-rose-500/20 bg-rose-500/10 text-rose-600',
    scheduled: 'border-amber-500/20 bg-amber-500/10 text-amber-600',
    completed: 'border-slate-500/20 bg-slate-500/10 text-slate-600',
    cancelled: 'border-muted bg-muted text-muted-foreground',
};

export default function AdminRestrictionsPage() {
    const [restrictions, setRestrictions] = useState<RestrictionRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'all' | RestrictionStatus>('all');
    const [cancelTarget, setCancelTarget] = useState<RestrictionRecord | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelError, setCancelError] = useState<string | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);

    const fetchRestrictions = useCallback(async (refreshing = false) => {
        if (refreshing) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        try {
            const response = await api.get('/admin/restrictions');
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.detail || 'Failed to load restrictions');
            }

            const payload: RestrictionsResponse = await response.json();
            setRestrictions(payload.data || []);
        } catch (err) {
            console.error('Failed to fetch restrictions:', err);
            setError(err instanceof Error ? err.message : 'Failed to load restrictions');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void fetchRestrictions();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [fetchRestrictions]);

    const summary = useMemo(() => {
        return restrictions.reduce(
            (acc, restriction) => {
                acc.total += 1;
                acc[restriction.status] += 1;
                return acc;
            },
            {
                total: 0,
                active: 0,
                scheduled: 0,
                completed: 0,
                cancelled: 0,
            } as Record<'total' | RestrictionStatus, number>,
        );
    }, [restrictions]);

    const visibleRestrictions = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return restrictions.filter((restriction) => {
            if (statusFilter !== 'all' && restriction.status !== statusFilter) {
                return false;
            }
            if (!query) {
                return true;
            }
            return [
                restriction.title,
                restriction.course_code,
                restriction.course_title,
                restriction.level,
                restriction.lecturer_name,
                restriction.university_name,
                restriction.reason,
            ].some((value) => (value || '').toLowerCase().includes(query));
        });
    }, [restrictions, searchQuery, statusFilter]);

    const openCancelDialog = (restriction: RestrictionRecord) => {
        setCancelTarget(restriction);
        setCancelReason('');
        setCancelError(null);
    };

    const closeCancelDialog = () => {
        if (isCancelling) return;
        setCancelTarget(null);
        setCancelReason('');
        setCancelError(null);
    };

    const submitCancel = async () => {
        if (!cancelTarget) return;

        setIsCancelling(true);
        setCancelError(null);
        try {
            const response = await api.patch(`/admin/restrictions/${cancelTarget.id}/cancel`, {
                reason: cancelReason.trim() || null,
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.detail || 'Failed to cancel restriction');
            }

            closeCancelDialog();
            setCancelTarget(null);
            await fetchRestrictions(true);
        } catch (err) {
            console.error('Failed to cancel restriction:', err);
            setCancelError(err instanceof Error ? err.message : 'Failed to cancel restriction');
        } finally {
            setIsCancelling(false);
        }
    };

    const filterOptions: Array<{ value: 'all' | RestrictionStatus; label: string; count: number }> = [
        { value: 'all', label: 'All', count: summary.total },
        { value: 'active', label: 'Active', count: summary.active },
        { value: 'scheduled', label: 'Scheduled', count: summary.scheduled },
        { value: 'completed', label: 'Completed', count: summary.completed },
        { value: 'cancelled', label: 'Cancelled', count: summary.cancelled },
    ];

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 pb-12 md:px-4 md:pt-6">
                    <header>
                        <h1 className="text-xl font-bold text-foreground md:text-3xl">Restrictions</h1>
                        <p className="mt-2 text-sm text-muted-foreground md:text-base">
                            Review test restrictions and cancel active or scheduled pauses when needed.
                        </p>
                    </header>

                    <section className="grid gap-3 sm:grid-cols-3">
                        <SummaryItem label="Active" value={summary.active} tone="text-rose-600" />
                        <SummaryItem label="Scheduled" value={summary.scheduled} tone="text-amber-600" />
                        <SummaryItem label="Total" value={summary.total} tone="text-foreground" />
                    </section>

                    <section className="space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                            {/* Desktop Search */}
                            <div className="hidden md:flex flex-1 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 focus-within:border-primary/50">
                                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    placeholder="Search by course, lecturer, university, or level..."
                                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                                />
                            </div>

                            {/* Mobile Search Toggle */}
                            <div className="md:hidden flex-1 w-full">
                                {!showMobileSearch ? (
                                    <button onClick={() => setShowMobileSearch(true)} className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-xl px-4 py-2.5 w-full transition-colors hover:border-primary/50">
                                        <Search className="w-4 h-4 shrink-0" />
                                        <span>Search restrictions...</span>
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 w-full bg-card border border-border rounded-xl px-4 py-2.5 focus-within:border-primary/50 transition-colors">
                                        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Search by course, lecturer..."
                                            className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground/70 text-foreground"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            onBlur={() => !searchQuery && setShowMobileSearch(false)}
                                        />
                                        <button onClick={() => { setSearchQuery(''); setShowMobileSearch(false); }} className="text-muted-foreground hover:text-foreground shrink-0">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {filterOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setStatusFilter(option.value)}
                                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                                            statusFilter === option.value
                                                ? 'border-primary/30 bg-primary/10 text-primary'
                                                : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                                        }`}
                                    >
                                        {option.label} {option.count}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => void fetchRestrictions(true)}
                                    disabled={isRefreshing}
                                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                                >
                                    <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>
                        </div>

                        <div className="hidden lg:block overflow-hidden rounded-2xl border border-border bg-card">
                            <div className="overflow-x-auto">
                                <table className="min-w-[900px] w-full text-left text-sm">
                                    <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                                        <tr>
                                            <th className="px-5 py-4">Restriction</th>
                                            <th className="px-5 py-4">Status</th>
                                            <th className="px-5 py-4">Lecturer</th>
                                            <th className="px-5 py-4">Window</th>
                                            <th className="px-5 py-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={5} className="px-5 py-16 text-center text-muted-foreground">
                                                    <span className="inline-flex items-center gap-2">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Loading restrictions...
                                                    </span>
                                                </td>
                                            </tr>
                                        ) : error ? (
                                            <tr>
                                                <td colSpan={5} className="px-5 py-16 text-center text-sm text-rose-600">
                                                    {error}
                                                </td>
                                            </tr>
                                        ) : visibleRestrictions.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-5 py-16 text-center text-muted-foreground">
                                                    No restrictions found.
                                                </td>
                                            </tr>
                                        ) : (
                                            visibleRestrictions.map((restriction) => (
                                                <tr key={restriction.id} className="transition-colors hover:bg-muted/40">
                                                    <td className="px-5 py-4">
                                                        <div className="font-semibold text-foreground">
                                                            {restriction.course_code || restriction.course_title || restriction.title || 'Untitled restriction'}
                                                        </div>
                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {restriction.university_name || 'Unknown university'} · Level {restriction.level || 'Unknown'}
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <StatusBadge status={restriction.status} />
                                                    </td>
                                                    <td className="px-5 py-4 text-muted-foreground">
                                                        {restriction.lecturer_name || 'Unknown lecturer'}
                                                    </td>
                                                    <td className="px-5 py-4 text-muted-foreground">
                                                        <div>{formatDateTime(restriction.start_time)}</div>
                                                        <div className="mt-1">{formatDateTime(restriction.end_time)}</div>
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        {canCancelRestriction(restriction.status) ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => openCancelDialog(restriction)}
                                                                className="rounded-lg border border-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/10"
                                                            >
                                                                Cancel
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">No action</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Mobile Cards */}
                        <div className="grid grid-cols-1 gap-4 lg:hidden">
                            {isLoading ? (
                                <div className="p-8 text-center text-muted-foreground bg-card border border-border rounded-2xl text-sm">
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading restrictions...
                                    </span>
                                </div>
                            ) : error ? (
                                <div className="p-8 text-center text-sm text-rose-600 bg-card border border-border rounded-2xl">
                                    {error}
                                </div>
                            ) : visibleRestrictions.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground bg-card border border-border rounded-2xl text-sm">
                                    No restrictions found.
                                </div>
                            ) : (
                                visibleRestrictions.map((restriction) => (
                                    <div key={restriction.id} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="font-semibold text-foreground text-sm">
                                                    {restriction.course_code || restriction.course_title || restriction.title || 'Untitled restriction'}
                                                </div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {restriction.university_name || 'Unknown university'} · Level {restriction.level || 'Unknown'}
                                                </div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {restriction.lecturer_name || 'Unknown lecturer'}
                                                </div>
                                            </div>
                                            <div className="shrink-0">
                                                <StatusBadge status={restriction.status} />
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center justify-between gap-4 border-t border-border pt-4 mt-2">
                                            <div className="text-xs text-muted-foreground">
                                                <div>{formatDateTime(restriction.start_time)}</div>
                                                <div className="mt-0.5">{formatDateTime(restriction.end_time)}</div>
                                            </div>
                                            <div>
                                                {canCancelRestriction(restriction.status) ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => openCancelDialog(restriction)}
                                                        className="rounded-lg border border-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/10 shrink-0"
                                                    >
                                                        Cancel
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">No action</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
            {cancelTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Cancel restriction</h2>
                                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                        This will immediately restore access for students matched by this restriction.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeCancelDialog}
                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                aria-label="Close"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                            <div className="font-medium text-foreground">
                                {cancelTarget.course_code || cancelTarget.course_title || cancelTarget.title || 'Untitled restriction'}
                            </div>
                            <div className="mt-1 text-muted-foreground">
                                Level {cancelTarget.level || 'Unknown'} · {cancelTarget.lecturer_name || 'Unknown lecturer'}
                            </div>
                        </div>

                        <label className="mt-5 block text-sm font-medium text-foreground">
                            Reason <span className="text-muted-foreground">(optional)</span>
                            <textarea
                                value={cancelReason}
                                onChange={(event) => setCancelReason(event.target.value)}
                                className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                                placeholder="Example: lecturer requested correction after test ended."
                            />
                        </label>

                        {cancelError && (
                            <p className="mt-3 text-sm text-rose-600">{cancelError}</p>
                        )}

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={closeCancelDialog}
                                disabled={isCancelling}
                                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                            >
                                Keep restriction
                            </button>
                            <button
                                type="button"
                                onClick={() => void submitCancel()}
                                disabled={isCancelling}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
                            >
                                {isCancelling && <Loader2 className="h-4 w-4 animate-spin" />}
                                Cancel restriction
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryItem({ label, value, tone }: { label: string; value: number; tone: string }) {
    return (
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
            <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
        </div>
    );
}

function StatusBadge({ status }: { status: RestrictionStatus }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_CLASSES[status]}`}>
            <ShieldAlert className="h-3.5 w-3.5" />
            {status}
        </span>
    );
}

function canCancelRestriction(status: RestrictionStatus) {
    return status === 'active' || status === 'scheduled';
}

function formatDateTime(value: string | null) {
    if (!value) {
        return 'Not set';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(parsed);
}
