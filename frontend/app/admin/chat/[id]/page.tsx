'use client';

import React, { useEffect, useState, use } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { ArrowLeft, User, Calendar, Clock, SquarePen, AlertTriangle, ThumbsUp, ThumbsDown } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { api } from '@/lib/api';

interface Message {
    id: number;
    role: 'system' | 'user' | 'assistant';
    content: string;
    image_data?: string;
    created_at: string;
}

interface ChatSession {
    title: string;
    created_at: string;
    user_id: string | null;
    display_name: string;
    profiles: {
        first_name: string | null;
        other_names: string | null;
        university: string | null;
        level: string | null;
    } | null;
}

interface RawSessionData {
    title: string;
    created_at: string;
    user_id: string | null;
    profiles?: {
        first_name: string | null;
        other_names: string | null;
        university: string | null;
        level: string | null;
    } | Array<{
        first_name: string | null;
        other_names: string | null;
        university: string | null;
        level: string | null;
    }> | null;
}

// Helper to safely parse image_data (JSON or raw string)
const getImages = (imgData: string | undefined): string[] => {
    if (!imgData) return [];
    try {
        if (imgData.trim().startsWith('[') && imgData.trim().endsWith(']')) {
            const parsed = JSON.parse(imgData);
            if (Array.isArray(parsed)) return parsed;
        }
        return [imgData];
    } catch {
        return [imgData];
    }
};

export default function AdminChatViewerPage({
    params,
    searchParams
}: {
    params: Promise<{ id: string }>,
    searchParams: Promise<{ [key: string]: string | undefined }>
}) {
    const resolvedParams = use(params);
    const resolvedSearchParams = use(searchParams);

    const { id } = resolvedParams;
    const targetMessageId = resolvedSearchParams.messageId ? parseInt(resolvedSearchParams.messageId) : null;
    const rating = resolvedSearchParams.rating as 'up' | 'down' | 'report' | undefined;

    const [session, setSession] = useState<ChatSession | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const response = await api.get(`/admin/chat/${id}`);
                if (!response.ok) throw new Error('Failed to fetch chat session');
                const payload = await response.json();
                const sessionData = payload.session as RawSessionData | null;
                if (sessionData) {
                    const raw = sessionData as RawSessionData;
                    const resolvedProfile = Array.isArray(raw.profiles)
                        ? (raw.profiles[0] ?? null)
                        : (raw.profiles ?? null);
                    const firstName = resolvedProfile?.first_name?.trim() || '';
                    const otherNames = resolvedProfile?.other_names?.trim() || '';
                    const displayName = [firstName, otherNames].filter(Boolean).join(' ').trim()
                        || (raw.user_id ? `User ${raw.user_id.slice(0, 8)}` : 'Anonymous User');
                    setSession({
                        title: raw.title,
                        created_at: raw.created_at,
                        user_id: raw.user_id,
                        display_name: displayName,
                        profiles: resolvedProfile,
                    });
                } else {
                    setSession(null);
                }

                setMessages((payload.messages as Message[]) ?? []);

            } catch (err) {
                console.error("Error loading chat:", err);
            } finally {
                setIsLoading(false);
            }
        };

        if (id) {
            fetchData();
        }
    }, [id]);

    // Auto-scroll to target message
    useEffect(() => {
        if (!isLoading && targetMessageId && messages.length > 0) {
            // Small delay to ensure rendering is complete
            setTimeout(() => {
                const element = document.getElementById(`msg-${targetMessageId}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500);
        }
    }, [isLoading, targetMessageId, messages]);

    // Helper to determine highlight styles based on rating
    const getHighlightStyles = () => {
        if (!rating) return {
            badgeBg: 'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
            ring: 'ring-red-500 shadow-red-500/10',
            icon: AlertTriangle,
            label: 'Reported Message'
        };

        switch (rating) {
            case 'up':
                return {
                    badgeBg: 'bg-green-100 text-green-600 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
                    ring: 'ring-green-500 shadow-green-500/10',
                    icon: ThumbsUp,
                    label: 'Positive Feedback'
                };
            case 'down':
                return {
                    badgeBg: 'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
                    ring: 'ring-red-500 shadow-red-500/10',
                    icon: ThumbsDown,
                    label: 'Negative Feedback'
                };
            default: // report
                return {
                    badgeBg: 'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
                    ring: 'ring-amber-500 shadow-amber-500/10',
                    icon: AlertTriangle,
                    label: 'Reported Message'
                };
        }
    };

    const highlightStyles = getHighlightStyles();
    const BadgeIcon = highlightStyles.icon;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-muted-foreground">Session not found.</p>
                <Link
                    href="/admin/feedback"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Feedback
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-border/50 pb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-20 pt-4">
                <Link
                    href="/admin/feedback"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Feedback
                </Link>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{session.title || 'Untitled Chat'}</h1>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-4 h-4" />
                                {new Date(session.created_at).toLocaleDateString('en-US', {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
                                })}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-4 h-4" />
                                {new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>

                    {/* User Badge */}
                    <div className="bg-muted/50 border border-border/50 rounded-lg px-4 py-3 min-w-[200px]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <div className="font-medium text-sm">
                                    {session.display_name}
                                </div>
                                {(session.profiles?.university || session.profiles?.level) && (
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        {[session.profiles?.university, session.profiles?.level].filter(Boolean).join(' • ')}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chat Feed */}
            <div className="space-y-6 py-4">
                {messages.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        No messages in this conversation.
                    </div>
                ) : (
                    messages.filter(m => m.role !== 'system').map((msg) => {
                        const isTarget = msg.id === targetMessageId;

                        return (
                            <div
                                key={msg.id}
                                id={`msg-${msg.id}`}
                                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full group transition-all duration-500`}
                            >
                                {/* Role Label & Reported/Feedback Badge */}
                                <div className={`flex items-center gap-2 mb-1 px-1 ${msg.role === 'user' ? 'mr-1 flex-row-reverse' : 'ml-1'}`}>
                                    <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">
                                        {msg.role === 'user' ? 'User' : 'Assistant'}
                                    </div>
                                    {isTarget && (
                                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${highlightStyles.badgeBg} text-[10px] font-bold uppercase tracking-wide border animate-pulse`}>
                                            <BadgeIcon className="w-3 h-3" />
                                            {highlightStyles.label}
                                        </div>
                                    )}
                                </div>

                                {/* Message Container */}
                                <div className={`max-w-[85%] rounded-2xl p-4 text-[15px] leading-relaxed shadow-sm transition-all duration-300 ${isTarget ? `ring-2 ${highlightStyles.ring} ring-offset-2 ring-offset-background shadow-lg` : ''
                                    } ${msg.role === 'user'
                                        ? 'bg-[#1e293b] text-white rounded-tr-sm dark:bg-[#253920] border border-white/5' // Dark green/slate for user
                                        : 'bg-card text-foreground rounded-tl-sm border border-border/50' // Standard card for AI
                                    }`}>

                                    {/* Images */}
                                    {msg.image_data && (
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {getImages(msg.image_data).map((img, idx) => (
                                                <img
                                                    key={idx}
                                                    src={`data:image/jpeg;base64,${img}`}
                                                    alt={`Attachment ${idx + 1}`}
                                                    className="max-w-full h-auto max-h-[300px] rounded-lg border border-white/10"
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* Content with Markdown */}
                                    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeRaw]}
                                            components={{
                                                // Customize link rendering to open in new tab
                                                a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" />,
                                                // Ensure code blocks look good
                                                code: ({ className, children, ...props }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) => {
                                                    const match = /language-(\w+)/.exec(className || '')
                                                    return !props.inline && match ? (
                                                        <code className={className} {...props}>
                                                            {children}
                                                        </code>
                                                    ) : (
                                                        <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs" {...props}>
                                                            {children}
                                                        </code>
                                                    )
                                                }
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>

                                {/* Timestamp */}
                                <div className={`text-[10px] text-muted-foreground mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="text-center pt-8 pb-4">
                <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1 rounded-full">
                    <SquarePen className="w-3 h-3" />
                    End of Conversation
                </div>
            </div>
        </div>
    );
}
