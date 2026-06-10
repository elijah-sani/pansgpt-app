'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    FileText,
    Loader2,
    MoreVertical,
    RefreshCcw,
    Search,
    Filter,
    X,
    XCircle,
} from 'lucide-react';

import { api } from '@/lib/api';

type MaterialStatus = 'pending_review' | 'approved' | 'rejected' | 'cancelled';

type MaterialSubmission = {
    id: string;
    university_name: string | null;
    lecturer_name: string | null;
    lecturer_email: string | null;
    course_code: string | null;
    course_title: string | null;
    level: string | null;
    title: string | null;
    file_name: string | null;
    file_url: string | null;
    file_type: string | null;
    mime_type: string | null;
    is_supported_file: boolean;
    status: MaterialStatus;
    review_note: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    pans_library_id: string | null;
    library_embedding_status: string | null;
    library_embedding_progress: number | null;
    library_embedding_error: string | null;
    created_at: string | null;
};

type MaterialsResponse = {
    data: MaterialSubmission[];
};

type ReviewAction = 'approve' | 'reject' | 'convert';

type ReviewDialogState = {
    action: ReviewAction;
    submission: MaterialSubmission;
} | null;

type DetailsDialogState = MaterialSubmission | null;

type ActionMenuState = {
    submission: MaterialSubmission;
    top: number;
    left: number;
    originClassName: string;
} | null;

const STATUS_LABELS: Record<MaterialStatus, string> = {
    pending_review: 'Pending review',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
};

const STATUS_CLASSES: Record<MaterialStatus, string> = {
    pending_review: 'border-amber-500/20 bg-amber-500/10 text-amber-600',
    approved: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600',
    rejected: 'border-rose-500/20 bg-rose-500/10 text-rose-600',
    cancelled: 'border-slate-500/20 bg-slate-500/10 text-slate-600',
};

const STATUS_OPTIONS: Array<{ value: 'all' | MaterialStatus; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'pending_review', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'cancelled', label: 'Cancelled' },
];

async function readApiError(response: Response, fallback: string) {
    const rawText = await response.clone().text().catch(() => '');
    if (!rawText) return fallback;

    try {
        const payload = JSON.parse(rawText) as { detail?: unknown; message?: unknown; error?: unknown };
        const detail = payload.detail ?? payload.message ?? payload.error;
        if (typeof detail === 'string' && detail.trim()) return detail;
        if (detail) return JSON.stringify(detail);
    } catch {
        return rawText;
    }

    return fallback;
}

export default function AdminMaterialSubmissionsPage() {
    const [submissions, setSubmissions] = useState<MaterialSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'all' | MaterialStatus>('all');
    const [dialog, setDialog] = useState<ReviewDialogState>(null);
    const [detailsSubmission, setDetailsSubmission] = useState<DetailsDialogState>(null);
    const [actionMenu, setActionMenu] = useState<ActionMenuState>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [reviewError, setReviewError] = useState<string | null>(null);
    const [isReviewing, setIsReviewing] = useState(false);

    const fetchSubmissions = useCallback(async (refreshing = false) => {
        if (refreshing) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (searchQuery.trim()) params.set('search', searchQuery.trim());
        const query = params.toString();

        try {
            const response = await api.get(`/admin/material-submissions${query ? `?${query}` : ''}`);
            if (!response.ok) {
                throw new Error(await readApiError(response, 'Failed to load material submissions'));
            }

            const payload = (await response.json()) as MaterialsResponse;
            setSubmissions(payload.data || []);
        } catch (err) {
            console.error('Failed to fetch material submissions:', err);
            setError(err instanceof Error ? err.message : 'Failed to load material submissions');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [searchQuery, statusFilter]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void fetchSubmissions();
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [fetchSubmissions]);

    const summary = useMemo(() => {
        return submissions.reduce(
            (acc, submission) => {
                acc.total += 1;
                acc[submission.status] += 1;
                return acc;
            },
            {
                total: 0,
                pending_review: 0,
                approved: 0,
                rejected: 0,
                cancelled: 0,
            } as Record<'total' | MaterialStatus, number>,
        );
    }, [submissions]);

    useEffect(() => {
        if (!actionMenu) return;

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-material-menu-root]') || target?.closest('[data-material-menu-trigger]')) {
                return;
            }
            setActionMenu(null);
        };

        const handleViewportChange = () => {
            setActionMenu(null);
        };

        document.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [actionMenu]);

    const openMenu = (submission: MaterialSubmission, event: React.MouseEvent<HTMLButtonElement>) => {
        const trigger = event.currentTarget.getBoundingClientRect();
        const menuWidth = 176;
        const menuHeight = submission.status === 'pending_review'
            ? (submission.is_supported_file ? 124 : 196)
            : 52;
        const margin = 12;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const spaceRight = viewportWidth - trigger.right;
        const spaceLeft = trigger.left;
        const spaceBottom = viewportHeight - trigger.bottom;
        const spaceTop = trigger.top;

        let left = trigger.right - menuWidth;
        let top = trigger.bottom + 8;
        let originClassName = 'origin-top-right';

        if (spaceBottom < menuHeight && spaceTop > spaceBottom) {
            top = trigger.top - menuHeight - 8;
            originClassName = 'origin-bottom-right';
        }

        if (spaceRight < menuWidth && spaceLeft > spaceRight) {
            left = trigger.left;
            originClassName = originClassName.includes('bottom') ? 'origin-bottom-left' : 'origin-top-left';
        }

        left = Math.min(Math.max(margin, left), viewportWidth - menuWidth - margin);
        top = Math.min(Math.max(margin, top), viewportHeight - menuHeight - margin);

        setActionMenu((current) =>
            current?.submission.id === submission.id
                ? null
                : { submission, left, top, originClassName }
        );
    };

    const openDialog = (action: ReviewAction, submission: MaterialSubmission) => {
        setActionMenu(null);
        setDialog({ action, submission });
        setRejectReason('');
        setReviewError(null);
    };

    const closeDialog = () => {
        if (isReviewing) return;
        setDialog(null);
        setRejectReason('');
        setReviewError(null);
    };

    const submitReview = async () => {
        if (!dialog) return;

        const reason = rejectReason.trim();
        if (dialog.action === 'reject' && !reason) {
            setReviewError('A rejection reason is required.');
            return;
        }

        setIsReviewing(true);
        setReviewError(null);

        try {
            const response = dialog.action === 'convert'
                ? await api.post(`/admin/material-submissions/${dialog.submission.id}/convert-to-pdf`, {})
                : await api.patch(
                    `/admin/material-submissions/${dialog.submission.id}/${dialog.action}`,
                    dialog.action === 'reject' ? { reason } : {},
                );
            if (!response.ok) {
                throw new Error(await readApiError(
                    response,
                    dialog.action === 'convert' ? 'Failed to convert material to PDF' : `Failed to ${dialog.action} material`,
                ));
            }

            closeDialog();
            setDialog(null);
            await fetchSubmissions(true);
        } catch (err) {
            console.error(`Failed to ${dialog.action} material submission:`, err);
            setReviewError(err instanceof Error ? err.message : `Failed to ${dialog.action} material`);
        } finally {
            setIsReviewing(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 pb-12 md:px-4 md:pt-6">
                    <header>
                        <h1 className="text-xl font-bold text-foreground md:text-3xl">Material Submissions</h1>
                        <p className="mt-2 text-sm text-muted-foreground md:text-base">
                            Review materials lecturers submit for students to study from.
                        </p>
                    </header>

                    <section className="hidden gap-3 sm:grid-cols-3 md:grid">
                        <SummaryItem label="Pending" value={summary.pending_review} tone="text-amber-600" />
                        <SummaryItem label="Approved" value={summary.approved} tone="text-emerald-600" />
                        <SummaryItem label="Total shown" value={summary.total} tone="text-foreground" />
                    </section>
                    <section className="grid grid-cols-2 gap-3 md:hidden">
                        <MobileQuickStatCard label="Pending" value={summary.pending_review} color="text-amber-500" bg="bg-amber-500/10" />
                        <MobileQuickStatCard label="Approved" value={summary.approved} color="text-emerald-500" bg="bg-emerald-500/10" />
                        <MobileQuickStatCard label="Rejected" value={summary.rejected} color="text-rose-500" bg="bg-rose-500/10" />
                        <MobileQuickStatCard label="Cancelled" value={summary.cancelled} color="text-slate-500" bg="bg-slate-500/10" />
                        <MobileQuickStatCard label="Total" value={summary.total} color="text-primary" bg="bg-primary/10" />
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
                                    placeholder="Search topic, course, lecturer, university, or file..."
                                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                                />
                            </div>

                            {/* Mobile Search Toggle */}
                            <div className="md:hidden flex w-full items-center gap-2">
                                {!showMobileSearch ? (
                                    <button onClick={() => setShowMobileSearch(true)} className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm text-muted-foreground transition-colors hover:border-primary/50">
                                        <Search className="w-4 h-4 shrink-0" />
                                        <span>Search submissions...</span>
                                    </button>
                                ) : (
                                    <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 transition-colors focus-within:border-primary/50">
                                        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Search topic, course..."
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
                                <div className="relative">
                                    <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground" aria-label="Filter status">
                                        <Filter className="h-4 w-4" />
                                    </button>
                                    <select
                                        value={statusFilter}
                                        onChange={(event) => setStatusFilter(event.target.value as 'all' | MaterialStatus)}
                                        className="absolute inset-0 h-11 w-11 cursor-pointer opacity-0"
                                        aria-label="Filter status"
                                    >
                                        {STATUS_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void fetchSubmissions(true)}
                                    disabled={isRefreshing}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
                                    aria-label="Refresh submissions"
                                >
                                    <RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                </button>
                            </div>

                            <div className="hidden grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                                <select
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value as 'all' | MaterialStatus)}
                                    className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary/50"
                                >
                                    {STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => void fetchSubmissions(true)}
                                    disabled={isRefreshing}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                                >
                                    <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {isLoading ? (
                                <div className="rounded-2xl border border-border bg-card px-5 py-16 text-center text-muted-foreground">
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading material submissions...
                                    </span>
                                </div>
                            ) : error ? (
                                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-16 text-center text-sm text-rose-600">
                                    {error}
                                </div>
                            ) : submissions.length === 0 ? (
                                <div className="rounded-2xl border border-border bg-card px-5 py-16 text-center text-muted-foreground">
                                    No material submissions found.
                                </div>
                            ) : (
                                <>
                                    <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-sm min-w-[1000px]">
                                            <colgroup>
                                                <col className="w-[22%]" />
                                                <col className="w-[18%]" />
                                                <col className="w-[18%]" />
                                                <col className="w-[12%]" />
                                                <col className="w-[16%]" />
                                                <col className="w-[14%]" />
                                            </colgroup>
                                            <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                                                <tr>
                                                    <th className="px-4 py-3">Material</th>
                                                    <th className="px-4 py-3">Course</th>
                                                    <th className="px-4 py-3">Lecturer</th>
                                                    <th className="px-4 py-3">Status</th>
                                                    <th className="px-4 py-3">Submitted</th>
                                                    <th className="px-4 py-3 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {submissions.map((submission) => (
                                                    <tr key={submission.id} className="align-top transition-colors hover:bg-muted/30">
                                                        <td className="px-4 py-4">
                                                            <div className="min-w-0">
                                                                <div className="truncate font-semibold text-foreground">
                                                                    {submission.title || 'Untitled material'}
                                                                </div>
                                                                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                                                    <span className="truncate">Level {submission.level || 'Unknown'}</span>
                                                                    <FileTypeBadge fileType={submission.file_type} isSupported={submission.is_supported_file} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <div className="min-w-0">
                                                                <div className="truncate font-medium text-foreground">
                                                                    {submission.course_code || 'No course code'}
                                                                </div>
                                                                <div className="mt-1 truncate text-xs text-muted-foreground">
                                                                    {submission.course_title || 'No course title'}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <div className="min-w-0">
                                                                <div className="truncate font-medium text-foreground">
                                                                    {submission.lecturer_name || 'Unknown lecturer'}
                                                                </div>
                                                                <div className="mt-1 truncate text-xs text-muted-foreground">
                                                                    {submission.university_name || 'Unknown university'}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <div className="min-w-0">
                                                                <div className="text-[11px] font-semibold uppercase text-muted-foreground">Review</div>
                                                                <StatusBadge status={submission.status} />
                                                                {submission.pans_library_id ? (
                                                                    <div className="mt-2 truncate text-xs text-muted-foreground">
                                                                        <span className="font-semibold">Processing:</span>{' '}
                                                                        {formatLibraryStatus(submission.library_embedding_status, submission.library_embedding_progress)}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 text-xs text-muted-foreground">
                                                            {formatDateTime(submission.created_at)}
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <div className="flex justify-end">
                                                                <button
                                                                    type="button"
                                                                    data-material-menu-trigger
                                                                    onClick={(event) => openMenu(submission, event)}
                                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                                    aria-label="Open actions"
                                                                >
                                                                    <MoreVertical className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        </div>
                                    </div>

                                    <div className="space-y-3 md:hidden">
                                        {submissions.map((submission) => (
                                            <article key={submission.id} className="rounded-2xl border border-border bg-card p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate font-semibold text-foreground">
                                                            {submission.title || 'Untitled material'}
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                            <span>Level {submission.level || 'Unknown'} - {submission.course_code || 'No course code'}</span>
                                                            <span className="font-semibold">Review:</span>
                                                            <StatusBadge status={submission.status} />
                                                            <FileTypeBadge fileType={submission.file_type} isSupported={submission.is_supported_file} />
                                                        </div>
                                                        {submission.pans_library_id ? (
                                                            <div className="mt-1 truncate text-xs text-muted-foreground">
                                                                <span className="font-semibold">Processing:</span>{' '}
                                                                {formatLibraryStatus(submission.library_embedding_status, submission.library_embedding_progress)}
                                                            </div>
                                                        ) : null}
                                                        <div className="mt-1 truncate text-xs text-muted-foreground">
                                                            {submission.lecturer_name || 'Unknown lecturer'}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-start gap-2">
                                                        <button
                                                            type="button"
                                                            data-material-menu-trigger
                                                            onClick={(event) => openMenu(submission, event)}
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                            aria-label="Open actions"
                                                        >
                                                            <MoreVertical className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="mt-3 text-xs text-muted-foreground">
                                                    {formatDateTime(submission.created_at)}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
            {detailsSubmission ? (
                <DetailsDialog
                    submission={detailsSubmission}
                    onClose={() => setDetailsSubmission(null)}
                />
            ) : null}
            {actionMenu ? (
                <ActionMenu
                    menu={actionMenu}
                    onView={(submission) => {
                        setActionMenu(null);
                        setDetailsSubmission(submission);
                    }}
                    onConvert={(submission) => openDialog('convert', submission)}
                    onApprove={(submission) => openDialog('approve', submission)}
                    onReject={(submission) => openDialog('reject', submission)}
                />
            ) : null}
            {dialog ? (
                <ReviewDialog
                    dialog={dialog}
                    rejectReason={rejectReason}
                    reviewError={reviewError}
                    isReviewing={isReviewing}
                    onReasonChange={setRejectReason}
                    onClose={closeDialog}
                    onSubmit={() => void submitReview()}
                />
            ) : null}
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

function MobileQuickStatCard({
    label,
    value,
    color,
    bg,
}: {
    label: string;
    value: number;
    color: string;
    bg: string;
}) {
    return (
        <div className="rounded-2xl border border-border bg-background/90 p-4">
            <div className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${bg} ${color}`}>
                {label}
            </div>
            <p className="mt-3 text-lg font-bold text-foreground">{value}</p>
        </div>
    );
}

function StatusBadge({ status }: { status: MaterialStatus }) {
    const textClass = STATUS_CLASSES[status]
        .split(' ')
        .find((className) => className.startsWith('text-')) || 'text-foreground';

    return (
        <span className={`text-xs font-semibold ${textClass}`}>
            {STATUS_LABELS[status]}
        </span>
    );
}

function FileTypeBadge({
    fileType,
    isSupported,
}: {
    fileType: string | null;
    isSupported: boolean;
}) {
    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                isSupported ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
            }`}
        >
            {formatFileType(fileType)}
        </span>
    );
}

function ActionMenu({
    menu,
    onView,
    onConvert,
    onApprove,
    onReject,
}: {
    menu: NonNullable<ActionMenuState>;
    onView: (submission: MaterialSubmission) => void;
    onConvert: (submission: MaterialSubmission) => void;
    onApprove: (submission: MaterialSubmission) => void;
    onReject: (submission: MaterialSubmission) => void;
}) {
    const submission = menu.submission;

    return (
        <div
            data-material-menu-root
            className={`fixed z-50 min-w-44 rounded-xl border border-border bg-background p-1.5 shadow-lg ${menu.originClassName}`}
            style={{ top: menu.top, left: menu.left }}
        >
            <button
                type="button"
                onClick={() => onView(submission)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
                <FileText className="h-3.5 w-3.5" />
                View
            </button>
            {submission.status === 'pending_review' ? (
                <>
                    <button
                        type="button"
                        onClick={() => {
                            if (!submission.is_supported_file) return;
                            onApprove(submission);
                        }}
                        disabled={!submission.is_supported_file}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
                            submission.is_supported_file
                                ? 'text-emerald-600 hover:bg-emerald-500/10'
                                : 'cursor-not-allowed text-muted-foreground opacity-60'
                        }`}
                    >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                    </button>
                    {!submission.is_supported_file ? (
                        <>
                            <div className="px-3 pb-1 pt-0.5 text-[11px] leading-4 text-muted-foreground">
                                Convert this file to PDF before approval.
                            </div>
                            <button
                                type="button"
                                onClick={() => onConvert(submission)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-500/10"
                            >
                                <FileText className="h-3.5 w-3.5" />
                                Convert to PDF
                            </button>
                        </>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => onReject(submission)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/10"
                    >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                    </button>
                </>
            ) : null}
        </div>
    );
}

function DetailsDialog({
    submission,
    onClose,
}: {
    submission: MaterialSubmission;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Material details</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Full submission information and library status.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="mt-5 space-y-4">
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-foreground">
                                {submission.title || 'Untitled material'}
                            </h3>
                            <StatusBadge status={submission.status} />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Submitted {formatDateTime(submission.created_at)}
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <DetailItem label="Level" value={submission.level || 'Unknown'} />
                        <DetailItem label="Course code" value={submission.course_code || 'No course code'} />
                        <DetailItem label="Course title" value={submission.course_title || 'No course title'} />
                        <DetailItem label="Lecturer" value={submission.lecturer_name || 'Unknown lecturer'} />
                        <DetailItem label="University" value={submission.university_name || 'Unknown university'} />
                        <DetailItem label="File type" value={formatFileType(submission.file_type)} />
                        <DetailItem label="Support status" value={submission.is_supported_file ? 'Supported for approval' : 'Convert to PDF before approval'} />
                        <DetailItem
                            label="Library status"
                            value={submission.pans_library_id ? formatLibraryStatus(submission.library_embedding_status, submission.library_embedding_progress) : 'Not linked'}
                        />
                    </div>

                    <div className="space-y-2 text-sm">
                        <div className="font-medium text-foreground">File</div>
                        {submission.file_url ? (
                            <a
                                href={submission.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex max-w-full items-center gap-2 font-semibold text-primary hover:underline"
                            >
                                <FileText className="h-4 w-4 shrink-0" />
                                <span className="truncate">{submission.file_name || 'Open file'}</span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            </a>
                        ) : (
                            <p className="text-muted-foreground">No file link</p>
                        )}
                    </div>

                    {submission.library_embedding_error ? (
                        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-700">
                            {submission.library_embedding_error}
                        </div>
                    ) : null}

                    {submission.review_note ? (
                        <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                            <div className="font-medium text-foreground">Review note</div>
                            <p className="mt-1">{submission.review_note}</p>
                        </div>
                    ) : null}

                    {submission.status === 'cancelled' ? (
                        <div className="rounded-xl border border-slate-500/20 bg-slate-500/10 p-3 text-sm text-slate-700">
                            <div className="font-medium text-foreground">Cancellation</div>
                            <p className="mt-1">
                                Cancelled{submission.cancelled_at ? ` on ${formatDateTime(submission.cancelled_at)}` : ''}.
                            </p>
                            {submission.cancellation_reason ? <p className="mt-1">{submission.cancellation_reason}</p> : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function DetailItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
            <div className="mt-1 text-sm text-foreground">{value}</div>
        </div>
    );
}

function ReviewDialog({
    dialog,
    rejectReason,
    reviewError,
    isReviewing,
    onReasonChange,
    onClose,
    onSubmit,
}: {
    dialog: NonNullable<ReviewDialogState>;
    rejectReason: string;
    reviewError: string | null;
    isReviewing: boolean;
    onReasonChange: (value: string) => void;
    onClose: () => void;
    onSubmit: () => void;
}) {
    const isRejecting = dialog.action === 'reject';
    const isConverting = dialog.action === 'convert';
    const title = isRejecting ? 'Reject material' : isConverting ? 'Convert to PDF' : 'Approve material';
    const body = isRejecting
        ? 'This will mark the material as rejected and send the reason back with the submission record.'
        : isConverting
            ? 'This will create an internal PDF copy of the submitted file so it can be approved for ingestion.'
            : 'This will approve the material and start library ingestion for students.';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isRejecting ? 'bg-rose-500/10 text-rose-600' : isConverting ? 'bg-blue-500/10 text-blue-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                            {isRejecting ? <AlertTriangle className="h-5 w-5" /> : isConverting ? <FileText className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                    <div className="font-medium text-foreground">
                        {dialog.submission.title || 'Untitled material'}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                        {dialog.submission.course_code || 'No course code'} - Level {dialog.submission.level || 'Unknown'}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                        {dialog.submission.lecturer_name || 'Unknown lecturer'}
                    </div>
                </div>

                {isRejecting ? (
                    <label className="mt-5 block text-sm font-medium text-foreground">
                        Rejection reason <span className="text-rose-600">*</span>
                        <textarea
                            value={rejectReason}
                            onChange={(event) => onReasonChange(event.target.value)}
                            className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                            placeholder="Explain what the lecturer should correct."
                        />
                    </label>
                ) : null}

                {reviewError ? <p className="mt-3 text-sm text-rose-600">{reviewError}</p> : null}

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isReviewing}
                        className="rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={isReviewing}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${isRejecting ? 'bg-rose-600 hover:bg-rose-700' : isConverting ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                        {isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {isRejecting ? 'Reject material' : isConverting ? 'Convert to PDF' : 'Approve material'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function formatDateTime(value: string | null) {
    if (!value) return 'Not set';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(parsed);
}

function formatLibraryStatus(status: string | null, progress: number | null) {
    if (!status) return 'Linked';
    if (status === 'processing') {
        const safeProgress = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : 0;
        return `Processing ${safeProgress}%`;
    }
    if (status === 'completed') return 'Ready';
    if (status === 'failed') return 'Failed';
    return status;
}

function formatFileType(fileType: string | null) {
    if (!fileType) return 'Unknown';
    return fileType.toUpperCase();
}

