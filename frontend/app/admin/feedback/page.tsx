'use client';

import React, { useEffect, useState } from 'react';
import {
    AlertTriangle,
    List,
    MessageSquare,
    Search,
    ThumbsDown,
    ThumbsUp,
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { api } from '@/lib/api';

interface FeedbackItem {
    id: number;
    rating: 'up' | 'down' | 'report';
    category: string;
    comments: string;
    created_at: string;
    session_id: string;
    message_id: string;
    user_id: string;
    profiles: {
        first_name: string | null;
        other_names: string | null;
        university: string | null;
        level: string | null;
        email?: string;
    } | null;
    display_name: string;
}

interface RawFeedbackItem {
    id: number;
    rating: 'up' | 'down' | 'report';
    category: string;
    comments: string;
    created_at: string;
    session_id: string;
    message_id: string;
    user_id: string;
    display_name?: string;
    profiles?: {
        first_name: string | null;
        other_names: string | null;
        university: string | null;
        level: string | null;
        email?: string;
    } | Array<{
        first_name: string | null;
        other_names: string | null;
        university: string | null;
        level: string | null;
        email?: string;
    }> | null;
}

export default function AdminFeedbackPage() {
    const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const [filterRating, setFilterRating] = useState<'all' | 'up' | 'down' | 'report'>('all');
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

    useEffect(() => {
        const fetchFeedback = async () => {
            setIsLoading(true);
            try {
                const res = await api.get('/admin/feedback');
                if (!res.ok) {
                    throw new Error(`Failed to fetch admin feedback: ${res.status}`);
                }

                const payload = await res.json();
                const data = (payload?.data || []) as RawFeedbackItem[];
                const normalized = data.map((item) => {
                    const resolvedProfile = Array.isArray(item.profiles) ? (item.profiles[0] ?? null) : (item.profiles ?? null);
                    const firstName = resolvedProfile?.first_name?.trim() || '';
                    const otherNames = resolvedProfile?.other_names?.trim() || '';
                    const localDisplayName = [firstName, otherNames].filter(Boolean).join(' ').trim();

                    return {
                        ...item,
                        profiles: resolvedProfile,
                        display_name: item.display_name || localDisplayName || `User ${item.user_id?.slice(0, 8) || 'Unknown'}`,
                    };
                });

                setFeedback(normalized);
            } catch (err) {
                console.error('Failed to fetch:', err);
            } finally {
                setIsLoading(false);
            }
        };

        void fetchFeedback();
    }, []);

    const totalFeedback = feedback.length;
    const thumbsUp = feedback.filter((item) => item.rating === 'up').length;
    const thumbsDown = feedback.filter((item) => item.rating === 'down').length;
    const reports = feedback.filter((item) => item.rating === 'report').length;

    const filteredFeedback = feedback.filter((item) => {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
            (item.comments?.toLowerCase() || '').includes(query) ||
            (item.category?.toLowerCase() || '').includes(query) ||
            (item.display_name?.toLowerCase() || '').includes(query);

        const matchesFilter = filterRating === 'all' || item.rating === filterRating;
        return matchesSearch && matchesFilter;
    });

    const renderRatingBadge = (rating: FeedbackItem['rating']) => {
        switch (rating) {
            case 'up':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <ThumbsUp className="h-3 w-3" />
                        Positive
                    </span>
                );
            case 'down':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        <ThumbsDown className="h-3 w-3" />
                        Negative
                    </span>
                );
            case 'report':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        Report
                    </span>
                );
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl space-y-8 animate-in fade-in duration-500 md:px-4 md:pt-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">User Feedback & Analytics</h1>
                <p className="mt-1 text-muted-foreground">
                    Monitor user ratings, reported issues, and overall feedback sentiment.
                </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-4">
                <StatsCard label="Total Feedback" value={totalFeedback} icon={MessageSquare} color="text-foreground" bg="bg-card" />
                <StatsCard label="Positive Ratings" value={thumbsUp} icon={ThumbsUp} color="text-green-500" bg="bg-green-500/10" borderColor="border-green-500/20" />
                <StatsCard label="Negative Ratings" value={thumbsDown} icon={ThumbsDown} color="text-red-500" bg="bg-red-500/10" borderColor="border-red-500/20" />
                <StatsCard label="General Reports" value={reports} icon={AlertTriangle} color="text-blue-500" bg="bg-blue-500/10" borderColor="border-blue-500/20" />
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="hidden w-full items-center gap-2 overflow-x-auto rounded-lg border border-border/50 bg-card p-1 shadow-sm md:flex md:w-fit">
                    <button
                        onClick={() => setFilterRating('all')}
                        title="All Feedback"
                        className={`rounded-md p-2 transition-all ${filterRating === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                    >
                        <List className="h-4 w-4" />
                    </button>
                    <div className="mx-1 h-4 w-px bg-border/50" />
                    <button
                        onClick={() => setFilterRating('up')}
                        title="Positive Ratings"
                        className={`rounded-md p-2 transition-all ${filterRating === 'up' ? 'bg-green-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-green-500/10 hover:text-green-500'}`}
                    >
                        <ThumbsUp className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setFilterRating('down')}
                        title="Negative Ratings"
                        className={`rounded-md p-2 transition-all ${filterRating === 'down' ? 'bg-red-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-500'}`}
                    >
                        <ThumbsDown className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setFilterRating('report')}
                        title="Reports"
                        className={`rounded-md p-2 transition-all ${filterRating === 'report' ? 'bg-amber-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500'}`}
                    >
                        <AlertTriangle className="h-4 w-4" />
                    </button>
                </div>

                <div className="relative hidden w-full md:block md:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search feedback..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm shadow-sm transition-all hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                </div>

                <div className="w-full md:hidden">
                    <div className="flex items-center gap-2">
                        {!showMobileSearch ? (
                            <button
                                onClick={() => setShowMobileSearch(true)}
                                className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm text-muted-foreground transition-all hover:border-primary/30"
                            >
                                <Search className="h-4 w-4 shrink-0" />
                                <span>Search feedback...</span>
                            </button>
                        ) : (
                            <div className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-4 transition-all focus-within:ring-2 focus-within:ring-primary/20">
                                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search feedback..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onBlur={() => {
                                        if (!searchQuery) setShowMobileSearch(false);
                                    }}
                                    className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                                />
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setShowMobileSearch(false);
                                    }}
                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setMobileFilterOpen((open) => !open)}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:text-foreground"
                                aria-label="Filter feedback"
                                aria-expanded={mobileFilterOpen}
                            >
                                <List className="h-4 w-4" />
                            </button>
                            {mobileFilterOpen ? (
                                <div className="absolute right-0 top-12 z-20 w-40 rounded-lg border border-border bg-background p-1 shadow-lg">
                                    <button onClick={() => { setFilterRating('all'); setMobileFilterOpen(false); }} className={`block w-full rounded-md px-3 py-2 text-left text-xs font-semibold ${filterRating === 'all' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}>All</button>
                                    <button onClick={() => { setFilterRating('up'); setMobileFilterOpen(false); }} className={`block w-full rounded-md px-3 py-2 text-left text-xs font-semibold ${filterRating === 'up' ? 'bg-green-500 text-white' : 'text-foreground hover:bg-muted'}`}>Positive</button>
                                    <button onClick={() => { setFilterRating('down'); setMobileFilterOpen(false); }} className={`block w-full rounded-md px-3 py-2 text-left text-xs font-semibold ${filterRating === 'down' ? 'bg-red-500 text-white' : 'text-foreground hover:bg-muted'}`}>Negative</button>
                                    <button onClick={() => { setFilterRating('report'); setMobileFilterOpen(false); }} className={`block w-full rounded-md px-3 py-2 text-left text-xs font-semibold ${filterRating === 'report' ? 'bg-amber-500 text-white' : 'text-foreground hover:bg-muted'}`}>Report</button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-4 md:hidden">
                {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="animate-pulse rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                            <div className="h-4 w-24 rounded bg-muted" />
                            <div className="mt-4 h-4 w-40 rounded bg-muted" />
                            <div className="mt-3 h-6 w-20 rounded-full bg-muted" />
                            <div className="mt-4 h-16 w-full rounded bg-muted" />
                        </div>
                    ))
                ) : filteredFeedback.length === 0 ? (
                    <div className="rounded-xl border border-border/50 bg-card px-6 py-16 text-center text-muted-foreground shadow-sm">
                        <div className="mb-2 flex justify-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                            </div>
                        </div>
                        <p className="text-lg font-medium text-foreground">No feedback found</p>
                        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground/80">
                            {searchQuery ? `No results matching "${searchQuery}"` : 'No feedback received yet. Keep checking back!'}
                        </p>
                    </div>
                ) : (
                    filteredFeedback.map((item) => (
                        <article key={item.id} className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="font-medium text-foreground">{item.display_name}</p>
                                    {item.profiles?.university || item.profiles?.level ? (
                                        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                            {[item.profiles?.university, item.profiles?.level].filter(Boolean).join(' • ')}
                                        </p>
                                    ) : null}
                                </div>
                                {renderRatingBadge(item.rating)}
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                <span>
                                    {new Date(item.created_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}
                                </span>
                                <span className="rounded border border-border/50 bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                    {item.category || 'General'}
                                </span>
                            </div>

                            <p className="mt-4 text-sm leading-6 text-foreground/80">{item.comments}</p>

                            {item.session_id ? (
                                <div className="mt-4">
                                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                                        Chat inspection pending
                                    </span>
                                </div>
                            ) : null}
                        </article>
                    ))
                )}
            </div>

            <div className="hidden w-full overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm md:block">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-border/50 bg-muted/40 text-xs uppercase text-muted-foreground">
                            <tr>
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium">User</th>
                                <th className="px-6 py-4 font-medium">Type</th>
                                <th className="px-6 py-4 font-medium">Category</th>
                                <th className="w-1/3 px-6 py-4 font-medium">Comments</th>
                                <th className="px-6 py-4 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 w-24 rounded bg-muted" /></td>
                                        <td className="px-6 py-4"><div className="h-4 w-32 rounded bg-muted" /></td>
                                        <td className="px-6 py-4"><div className="h-6 w-20 rounded-full bg-muted" /></td>
                                        <td className="px-6 py-4"><div className="h-4 w-24 rounded bg-muted" /></td>
                                        <td className="px-6 py-4"><div className="h-4 w-full rounded bg-muted" /></td>
                                        <td className="px-6 py-4 text-right"><div className="ml-auto h-8 w-8 rounded bg-muted" /></td>
                                    </tr>
                                ))
                            ) : filteredFeedback.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                                                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                                            </div>
                                            <p className="text-lg font-medium text-foreground">No feedback found</p>
                                            <p className="mx-auto max-w-sm text-sm text-muted-foreground/80">
                                                {searchQuery ? `No results matching "${searchQuery}"` : 'No feedback received yet. Keep checking back!'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredFeedback.map((item) => (
                                    <tr key={item.id} className="group transition-colors hover:bg-muted/5">
                                        <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-muted-foreground">
                                            {new Date(item.created_at).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-foreground">{item.display_name}</span>
                                                {item.profiles?.university || item.profiles?.level ? (
                                                    <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                                        {[item.profiles?.university, item.profiles?.level].filter(Boolean).join(' • ')}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4">{renderRatingBadge(item.rating)}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-block rounded border border-border/50 bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                                {item.category || 'General'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="line-clamp-2 text-sm leading-relaxed text-foreground/80 transition-colors group-hover:text-foreground" title={item.comments}>
                                                {item.comments}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {item.session_id ? (
                                                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                                                    Chat inspection pending
                                                </span>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatsCard({
    label,
    value,
    icon: Icon,
    color,
    bg,
    borderColor = 'border-border/50',
}: {
    label: string;
    value: number;
    icon: LucideIcon;
    color: string;
    bg: string;
    borderColor?: string;
}) {
    return (
        <div className={`group relative overflow-hidden rounded-2xl border ${borderColor} ${bg} p-5 shadow-sm transition-shadow hover:shadow-md`}>
            <div className="z-10 flex items-start justify-between">
                <span className="text-sm font-medium text-muted-foreground">{label}</span>
                <div className={`rounded-lg p-2 ${bg} brightness-110`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                </div>
            </div>
            <div className="z-10 mt-6">
                <div className={`text-3xl font-bold tracking-tight ${color}`}>{value}</div>
            </div>
            <div className={`absolute -bottom-4 -right-4 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-20 ${color} bg-current`} />
        </div>
    );
}
