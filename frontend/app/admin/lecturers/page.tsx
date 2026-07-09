'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    Check,
    Filter,
    Loader2,
    Mail,
    Phone,
    RefreshCcw,
    Search,
    UserCheck,
    X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { fetchBootstrap } from '@/lib/bootstrap-cache';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

type LecturerStatus = 'pending' | 'active' | 'rejected' | 'suspended' | 'revoked';
type LecturerAction = 'approve' | 'reject' | 'suspend' | 'revoke' | 'reactivate';

interface LecturerProfile {
    id: string;
    user_id: string;
    university_id: string;
    university_name: string | null;
    title: string | null;
    full_name: string;
    email: string;
    phone_number: string | null;
    status: LecturerStatus;
    rejection_reason: string | null;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string | null;
    updated_at: string | null;
}

interface LecturersResponse {
    data: LecturerProfile[];
}

const STATUS_BADGE_CLASS: Record<LecturerStatus, string> = {
    pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    rejected: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    suspended: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    revoked: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

const ACTION_COPY: Record<LecturerAction, { title: string; verb: string; needsReason: boolean; reasonOptional: boolean }> = {
    approve: { title: 'Approve lecturer', verb: 'Approve', needsReason: false, reasonOptional: false },
    reject: { title: 'Reject lecturer', verb: 'Reject', needsReason: true, reasonOptional: false },
    suspend: { title: 'Suspend lecturer', verb: 'Suspend', needsReason: false, reasonOptional: true },
    revoke: { title: 'Revoke lecturer', verb: 'Revoke', needsReason: false, reasonOptional: true },
    reactivate: { title: 'Reactivate lecturer', verb: 'Reactivate', needsReason: false, reasonOptional: false },
};

export default function AdminLecturersPage() {
    const [lecturers, setLecturers] = useState<LecturerProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | LecturerStatus>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [actionTarget, setActionTarget] = useState<LecturerProfile | null>(null);
    const [actionType, setActionType] = useState<LecturerAction | null>(null);
    const [reason, setReason] = useState('');
    const [actionError, setActionError] = useState<string | null>(null);
    const [isSubmittingAction, setIsSubmittingAction] = useState(false);
    const [filterMenuOpen, setFilterMenuOpen] = useState(false);

    const router = useRouter();

    // Guard: only Senior Admins and Super Admins can access this page
    useEffect(() => {
        void fetchBootstrap().then((data) => {
            if (!data) return;
            const isSuperAdmin = Boolean(data.is_super_admin);
            const isSeniorAdmin = Boolean(data.is_senior_university_admin || data.admin_level === 'senior');
            if (!isSuperAdmin && !isSeniorAdmin) {
                router.replace('/admin');
            }
        });
    }, [router]);

    const fetchLecturers = useCallback(async (showRefreshing = false) => {
        if (showRefreshing) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        try {
            const params = new URLSearchParams();
            if (statusFilter !== 'all') {
                params.set('status', statusFilter);
            }
            if (searchQuery.trim()) {
                params.set('search', searchQuery.trim());
            }

            const response = await api.get(`/admin/lecturers${params.toString() ? `?${params.toString()}` : ''}`);
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.detail || 'Failed to load lecturers');
            }

            const payload: LecturersResponse = await response.json();
            setLecturers(payload.data || []);
        } catch (err) {
            console.error('Failed to fetch lecturers:', err);
            setError(err instanceof Error ? err.message : 'Failed to load lecturers');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [searchQuery, statusFilter]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void fetchLecturers();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [fetchLecturers]);

    const summary = useMemo(() => {
        return lecturers.reduce(
            (acc, lecturer) => {
                acc.total += 1;
                acc[lecturer.status] += 1;
                return acc;
            },
            {
                total: 0,
                pending: 0,
                active: 0,
                rejected: 0,
                suspended: 0,
                revoked: 0,
            } as Record<'total' | LecturerStatus, number>,
        );
    }, [lecturers]);

    const filteredLecturers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return lecturers.filter((lecturer) => {
            if (statusFilter !== 'all' && lecturer.status !== statusFilter) {
                return false;
            }
            if (!query) {
                return true;
            }
            const haystacks = [
                lecturer.title || '',
                lecturer.full_name,
                lecturer.email,
                lecturer.phone_number || '',
                lecturer.university_name || '',
            ];
            return haystacks.some((value) => value.toLowerCase().includes(query));
        });
    }, [lecturers, searchQuery, statusFilter]);

    const openActionDialog = (lecturer: LecturerProfile, action: LecturerAction) => {
        setActionTarget(lecturer);
        setActionType(action);
        setReason(lecturer.status === 'rejected' ? lecturer.rejection_reason || '' : '');
        setActionError(null);
    };

    const closeActionDialog = () => {
        setActionTarget(null);
        setActionType(null);
        setReason('');
        setActionError(null);
        setIsSubmittingAction(false);
    };

    const filterOptions: Array<{ value: 'all' | LecturerStatus; label: string; count: number }> = [
        { value: 'all', label: 'All lecturers', count: summary.total },
        { value: 'pending', label: 'Pending', count: summary.pending },
        { value: 'active', label: 'Active', count: summary.active },
        { value: 'rejected', label: 'Rejected', count: summary.rejected },
        { value: 'suspended', label: 'Suspended', count: summary.suspended },
        { value: 'revoked', label: 'Revoked', count: summary.revoked },
    ];

    const submitAction = async () => {
        if (!actionTarget || !actionType) return;

        const copy = ACTION_COPY[actionType];
        const trimmedReason = reason.trim();
        if (copy.needsReason && !trimmedReason) {
            setActionError('A reason is required for this action.');
            return;
        }

        setIsSubmittingAction(true);
        setActionError(null);

        try {
            const endpoint = `/admin/lecturers/${actionTarget.id}/${actionType}`;
            const body = actionType === 'approve' || actionType === 'reactivate'
                ? {}
                : { reason: trimmedReason || null };

            const response = await api.patch(endpoint, body);
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.detail || `Failed to ${actionType} lecturer`);
            }

            closeActionDialog();
            await fetchLecturers(true);
        } catch (err) {
            console.error(`Failed to ${actionType} lecturer:`, err);
            setActionError(err instanceof Error ? err.message : `Failed to ${actionType} lecturer`);
            setIsSubmittingAction(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl space-y-8 pb-12 md:px-4 md:pt-6 animate-in fade-in duration-500">
                    <header className="mb-6 md:mb-8">
                        <h1 className="text-xl md:text-3xl font-bold text-foreground">Lecturer Approvals</h1>
                        <p className="mt-2 text-muted-foreground">
                            Review lecturer registrations and manage lecturer access states.
                        </p>
                    </header>

                    <section>
                        <div className="flex flex-col gap-3 md:flex-row md:items-center">
                            {/* Desktop Search */}
                            <div className="hidden md:flex flex-1 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 focus-within:border-primary/50">
                                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search by name, email, university, or phone..."
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                                />
                            </div>

                            {/* Mobile Search Toggle */}
                            <div className="md:hidden w-full flex-1">
                                {!showMobileSearch ? (
                                    <button onClick={() => setShowMobileSearch(true)} className="flex items-center gap-2 text-sm text-muted-foreground bg-background border border-border rounded-xl px-4 py-2.5 w-full transition-all hover:border-primary/50">
                                        <Search className="w-4 h-4 shrink-0" />
                                        <span className="truncate">Search by name, email...</span>
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 w-full bg-background border border-primary/50 rounded-xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                                        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Search by name, email..."
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
                            <div className="flex items-center justify-between gap-2 md:justify-start md:self-auto">
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setFilterMenuOpen((open) => !open)}
                                        className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                                        aria-haspopup="menu"
                                        aria-expanded={filterMenuOpen}
                                        aria-label="Filter lecturers"
                                    >
                                        <Filter className="h-4 w-4" />
                                    </button>
                                    {filterMenuOpen ? (
                                        <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-border bg-background py-1 shadow-lg">
                                            <div className="space-y-0.5">
                                                {filterOptions.map((option) => {
                                                    const selected = statusFilter === option.value;
                                                    return (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            onClick={() => {
                                                                setStatusFilter(option.value);
                                                                setFilterMenuOpen(false);
                                                            }}
                                                            className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${
                                                                selected ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
                                                            }`}
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                {selected ? <Check className="h-4 w-4 text-primary" /> : <span className="h-4 w-4" />}
                                                                <span>{option.label}</span>
                                                            </span>
                                                            <span className="text-xs font-medium text-muted-foreground">
                                                                {option.count}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFilterMenuOpen(false);
                                        void fetchLecturers(true);
                                    }}
                                    disabled={isRefreshing}
                                    className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                                    aria-label="Refresh lecturers"
                                >
                                    <RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-border bg-background">
                        {error ? (
                            <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
                                <div className="rounded-full bg-destructive/10 p-3 text-destructive">
                                    <AlertCircle className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground">Unable to load lecturers</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fetchLecturers()}
                                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                                >
                                    Try again
                                </button>
                            </div>
                        ) : isLoading ? (
                            <div className="flex min-h-[320px] items-center justify-center gap-3 text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span>Loading lecturer registrations...</span>
                            </div>
                        ) : filteredLecturers.length === 0 ? (
                            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
                                <div className="rounded-full bg-muted p-3 text-muted-foreground">
                                    <UserCheck className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground">No lecturers found</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Try a different search or status filter.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {statusFilter !== 'all' ? (
                                    <div className="px-4 py-3 md:px-5">
                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('all')}
                                            className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                                        >
                                            Clear filter
                                        </button>
                                    </div>
                                ) : null}
                                <div className="hidden overflow-x-auto lg:block">
                                    <table className="w-full min-w-[980px] text-left text-sm">
                                        <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            <tr>
                                                <th className="px-6 py-4">Lecturer</th>
                                                <th className="px-6 py-4">Contact</th>
                                                <th className="px-6 py-4">University</th>
                                                <th className="px-6 py-4">Status</th>
                                                <th className="px-6 py-4">Submitted</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {filteredLecturers.map((lecturer) => (
                                                <tr key={lecturer.id} className="hover:bg-muted/20">
                                                    <td className="px-6 py-4 align-top">
                                                        <p className="font-medium text-foreground">
                                                            {lecturer.title ? `${lecturer.title} ` : ''}{lecturer.full_name}
                                                        </p>
                                                        <p className="mt-1 text-xs text-muted-foreground">{lecturer.email}</p>
                                                    </td>
                                                    <td className="px-6 py-4 align-top">
                                                        <div className="space-y-2 text-muted-foreground">
                                                            <div className="flex items-center gap-2">
                                                                <Mail className="h-3.5 w-3.5" />
                                                                <span className="text-xs">{lecturer.email}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Phone className="h-3.5 w-3.5" />
                                                                <span className="text-xs">{lecturer.phone_number || 'Not provided'}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 align-top text-muted-foreground">
                                                        {lecturer.university_name || 'Unknown university'}
                                                    </td>
                                                    <td className="px-6 py-4 align-top">
                                                        <StatusBadge status={lecturer.status} />
                                                    </td>
                                                    <td className="px-6 py-4 align-top text-muted-foreground">
                                                        {formatDate(lecturer.created_at)}
                                                    </td>
                                                    <td className="px-6 py-4 align-top">
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            {getAvailableActions(lecturer.status).map((action) => (
                                                                <ActionButton
                                                                    key={action}
                                                                    action={action}
                                                                    onClick={() => openActionDialog(lecturer, action)}
                                                                />
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="grid gap-4 p-4 lg:hidden">
                                    {filteredLecturers.map((lecturer) => (
                                        <article key={lecturer.id} className="rounded-2xl border border-border bg-background p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="truncate font-semibold text-foreground">
                                                        {lecturer.title ? `${lecturer.title} ` : ''}{lecturer.full_name}
                                                    </h3>
                                                    <p className="mt-1 truncate text-sm text-muted-foreground">{lecturer.university_name || 'Unknown university'}</p>
                                                </div>
                                                <StatusBadge status={lecturer.status} />
                                            </div>
                                            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                                                <div className="flex items-center gap-2">
                                                    <Mail className="h-4 w-4" />
                                                    <span className="truncate">{lecturer.email}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Phone className="h-4 w-4" />
                                                    <span className="truncate">{lecturer.phone_number || 'Not provided'}</span>
                                                </div>
                                                <p>Submitted {formatDate(lecturer.created_at)}</p>
                                            </div>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {getAvailableActions(lecturer.status).map((action) => (
                                                    <ActionButton
                                                        key={action}
                                                        action={action}
                                                        onClick={() => openActionDialog(lecturer, action)}
                                                    />
                                                ))}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </>
                        )}
                    </section>

            <Dialog open={Boolean(actionTarget && actionType)} onOpenChange={(open) => !open && closeActionDialog()}>
                <DialogContent className="rounded-2xl border border-border bg-card sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{actionType ? ACTION_COPY[actionType].title : 'Update lecturer'}</DialogTitle>
                        <DialogDescription>
                            {actionTarget
                                ? `You are about to ${actionType} ${actionTarget.title ? `${actionTarget.title} ` : ''}${actionTarget.full_name}.`
                                : 'Review this lecturer action before continuing.'}
                        </DialogDescription>
                    </DialogHeader>

                    {actionTarget && (
                        <div className="rounded-xl border border-border bg-background p-4 text-sm">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lecturer</p>
                                    <p className="mt-1 font-medium text-foreground">
                                        {actionTarget.title ? `${actionTarget.title} ` : ''}{actionTarget.full_name}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current status</p>
                                    <div className="mt-1">
                                        <StatusBadge status={actionTarget.status} />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</p>
                                    <p className="mt-1 text-foreground">{actionTarget.email}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">University</p>
                                    <p className="mt-1 text-foreground">{actionTarget.university_name || 'Unknown university'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {actionType && (ACTION_COPY[actionType].needsReason || ACTION_COPY[actionType].reasonOptional) && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">
                                Reason {ACTION_COPY[actionType].needsReason ? '' : <span className="text-muted-foreground">(optional)</span>}
                            </label>
                            <textarea
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                rows={4}
                                placeholder={actionType === 'reject' ? 'Add a clear rejection reason' : 'Add an optional note for this decision'}
                                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50"
                            />
                        </div>
                    )}

                    {actionError && (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {actionError}
                        </div>
                    )}

                    <DialogFooter>
                        <button
                            type="button"
                            onClick={closeActionDialog}
                            disabled={isSubmittingAction}
                            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={submitAction}
                            disabled={isSubmittingAction}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                        >
                            {isSubmittingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {actionType ? ACTION_COPY[actionType].verb : 'Confirm'}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function StatusBadge({ status }: { status: LecturerStatus }) {
    return (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_BADGE_CLASS[status]}`}>
            {status}
        </span>
    );
}

function ActionButton({ action, onClick }: { action: LecturerAction; onClick: () => void }) {
    const label = ACTION_COPY[action].verb;
    const toneClass = {
        approve: 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20',
        reject: 'bg-rose-500/10 text-rose-700 hover:bg-rose-500/20',
        suspend: 'bg-orange-500/10 text-orange-700 hover:bg-orange-500/20',
        revoke: 'bg-slate-500/10 text-slate-700 hover:bg-slate-500/20',
        reactivate: 'bg-primary/10 text-primary hover:bg-primary/20',
    }[action];

    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${toneClass}`}
        >
            {label}
        </button>
    );
}

function getAvailableActions(status: LecturerStatus): LecturerAction[] {
    if (status === 'pending') return ['approve', 'reject'];
    if (status === 'active') return ['suspend', 'revoke'];
    if (status === 'suspended') return ['approve', 'revoke', 'reactivate'];
    if (status === 'rejected') return ['approve'];
    return [];
}

function formatDate(value: string | null) {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return new Intl.DateTimeFormat('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(date);
}
