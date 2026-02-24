'use client';

import React, { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import {
    ThumbsUp,
    ThumbsDown,
    AlertTriangle,
    MessageSquare,
    Search,
    ArrowUpRight,
    List
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

// --- Types ---
interface FeedbackItem {
    id: number;
    rating: 'up' | 'down' | 'report';
    category: string;
    comments: string;
    created_at: string;
    session_id: string;
    message_id: string; // Added field
    user_id: string;
    profiles: {
        first_name: string | null;
        university: string | null;
        level: string | null;
        email?: string;
    } | null;
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
    profiles?: Array<{
        first_name: string | null;
        university: string | null;
        level: string | null;
        email?: string;
    }> | null;
}

export default function AdminFeedbackPage() {
    const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRating, setFilterRating] = useState<'all' | 'up' | 'down' | 'report'>('all');

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // --- Fetch Data ---
    useEffect(() => {
        const fetchFeedback = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('message_feedback')
                    .select(`
                        id,
                        rating,
                        category,
                        comments,
                        created_at,
                        session_id,
                        message_id, 
                        user_id,
                        profiles ( first_name, university, level )
                    `)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error("Error fetching feedback:", error);
                } else {
                    const normalized = ((data || []) as RawFeedbackItem[]).map((item) => ({
                        ...item,
                        profiles: item.profiles?.[0] ?? null,
                    }));
                    setFeedback(normalized);
                }
            } catch (err) {
                console.error("Failed to fetch:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchFeedback();
    }, [supabase]);

    // --- Stats Calculation ---
    const totalFeedback = feedback.length;
    const thumbsUp = feedback.filter(f => f.rating === 'up').length;
    const thumbsDown = feedback.filter(f => f.rating === 'down').length;
    const reports = feedback.filter(f => f.rating === 'report').length;

    // --- Filter Logic ---
    const filteredFeedback = feedback.filter(item => {
        const matchesSearch =
            (item.comments?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
            (item.category?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
            (item.profiles?.first_name?.toLowerCase() || '').includes(searchQuery.toLowerCase());

        const matchesFilter = filterRating === 'all' || item.rating === filterRating;

        return matchesSearch && matchesFilter;
    });

    // --- Render Helpers ---
    const renderRatingBadge = (rating: string) => {
        switch (rating) {
            case 'up':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <ThumbsUp className="w-3 h-3" />
                        Positive
                    </span>
                );
            case 'down':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        <ThumbsDown className="w-3 h-3" />
                        Negative
                    </span>
                );
            case 'report':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        <AlertTriangle className="w-3 h-3" />
                        Report
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 w-full">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">User Feedback & Analytics</h1>
                <p className="text-muted-foreground mt-1">
                    Monitor user ratings, reported issues, and overall feedback sentiment.
                </p>
            </div>

            {/* Stats Cards - Full Width */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full">
                <StatsCard
                    label="Total Feedback"
                    value={totalFeedback}
                    icon={MessageSquare}
                    color="text-foreground"
                    bg="bg-card"
                />
                <StatsCard
                    label="Positive Ratings"
                    value={thumbsUp}
                    icon={ThumbsUp}
                    color="text-green-500"
                    bg="bg-green-500/10"
                    borderColor="border-green-500/20"
                />
                <StatsCard
                    label="Negative Ratings"
                    value={thumbsDown}
                    icon={ThumbsDown}
                    color="text-red-500"
                    bg="bg-red-500/10"
                    borderColor="border-red-500/20"
                />
                <StatsCard
                    label="General Reports"
                    value={reports}
                    icon={AlertTriangle}
                    color="text-blue-500"
                    bg="bg-blue-500/10"
                    borderColor="border-blue-500/20"
                />
            </div>

            {/* Filters & Search - Combined Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">

                {/* Compact Icon-Only Filter Bar */}
                <div className="flex items-center gap-2 p-1 rounded-lg border border-border/50 bg-card w-fit shadow-sm">
                    <button
                        onClick={() => setFilterRating('all')}
                        title="All Feedback"
                        className={`p-2 rounded-md transition-all ${filterRating === 'all'
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                            }`}
                    >
                        <List className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-border/50 mx-1" />
                    <button
                        onClick={() => setFilterRating('up')}
                        title="Positive Ratings"
                        className={`p-2 rounded-md transition-all ${filterRating === 'up'
                            ? 'bg-green-500 text-white shadow-sm'
                            : 'text-muted-foreground hover:text-green-500 hover:bg-green-500/10'
                            }`}
                    >
                        <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setFilterRating('down')}
                        title="Negative Ratings"
                        className={`p-2 rounded-md transition-all ${filterRating === 'down'
                            ? 'bg-red-500 text-white shadow-sm'
                            : 'text-muted-foreground hover:text-red-500 hover:bg-red-500/10'
                            }`}
                    >
                        <ThumbsDown className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setFilterRating('report')}
                        title="Reports"
                        className={`p-2 rounded-md transition-all ${filterRating === 'report'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'
                            }`}
                    >
                        <AlertTriangle className="w-4 h-4" />
                    </button>
                </div>

                {/* Search */}
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search feedback..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm hover:border-primary/30"
                    />
                </div>
            </div>

            {/* Table Card - Full Width */}
            <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden w-full">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border/50">
                            <tr>
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium">User</th>
                                <th className="px-6 py-4 font-medium">Type</th>
                                <th className="px-6 py-4 font-medium">Category</th>
                                <th className="px-6 py-4 font-medium w-1/3">Comments</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {isLoading ? (
                                // Loading Skeletons
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 w-24 bg-muted rounded"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-32 bg-muted rounded"></div></td>
                                        <td className="px-6 py-4"><div className="h-6 w-20 bg-muted rounded-full"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-24 bg-muted rounded"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-full bg-muted rounded"></div></td>
                                        <td className="px-6 py-4 text-right"><div className="h-8 w-8 bg-muted rounded ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : filteredFeedback.length === 0 ? (
                                // Empty State
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                                                <MessageSquare className="w-8 h-8 text-muted-foreground/50" />
                                            </div>
                                            <p className="text-lg font-medium text-foreground">No feedback found</p>
                                            <p className="text-sm max-w-sm mx-auto text-muted-foreground/80">
                                                {searchQuery
                                                    ? `No results matching "${searchQuery}"`
                                                    : "No feedback received yet. Keep checking back!"}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredFeedback.map((item) => (
                                    <tr key={item.id} className="hover:bg-muted/5 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground font-mono text-xs">
                                            {new Date(item.created_at).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric'
                                            })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-foreground">
                                                    {item.profiles?.first_name || 'Anonymous'}
                                                </span>
                                                {(item.profiles?.university || item.profiles?.level) && (
                                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                                                        {[item.profiles?.university, item.profiles?.level].filter(Boolean).join(' • ')}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {renderRatingBadge(item.rating)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border/50">
                                                {item.category || 'General'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="line-clamp-2 text-sm text-foreground/80 group-hover:text-foreground transition-colors leading-relaxed" title={item.comments}>
                                                {item.comments}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {item.session_id && (
                                                <Link
                                                    href={`/admin/chat/${item.session_id}?messageId=${item.message_id}&rating=${item.rating}`}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/15 rounded-md transition-colors border border-primary/10 hover:border-primary/20"
                                                >
                                                    View Chat
                                                    <ArrowUpRight className="w-3 h-3" />
                                                </Link>
                                            )}
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

// --- Sub-components ---

function StatsCard({
    label,
    value,
    icon: Icon,
    color,
    bg,
    borderColor = "border-border/50"
}: {
    label: string;
    value: number;
    icon: LucideIcon;
    color: string;
    bg: string;
    borderColor?: string;
}) {
    return (
        <div className={`p-5 rounded-xl border ${borderColor} ${bg} shadow-sm flex flex-col justify-between h-28 relative overflow-hidden group hover:shadow-md transition-shadow`}>
            <div className="flex justify-between items-start z-10">
                <span className="text-sm font-medium text-muted-foreground">{label}</span>
                <div className={`p-2 rounded-lg ${bg} brightness-110`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                </div>
            </div>
            <div className="z-10">
                <div className={`text-3xl font-bold tracking-tight ${color}`}>{value}</div>
            </div>
            {/* Ambient Background Glow */}
            <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-10 bg-current ${color} blur-2xl group-hover:opacity-20 transition-opacity`} />
        </div>
    );
}
