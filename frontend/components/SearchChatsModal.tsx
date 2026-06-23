'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';

interface ChatSession {
    id: string;
    title: string;
    created_at: string;
    updated_at?: string | null;
    search_preview?: string | null;
    search_match_source?: string | null;
}

interface SearchChatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessions: ChatSession[];
    onSelectSession: (id: string) => void;
}

export default function SearchChatsModal({ isOpen, onClose, sessions, onSelectSession }: SearchChatsModalProps) {
    const [query, setQuery] = useState('');
    const [remoteResults, setRemoteResults] = useState<ChatSession[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setRemoteResults([]);
        }
    }, [isOpen]);

    useEffect(() => {
        const trimmedQuery = query.trim();
        if (!isOpen || !trimmedQuery) {
            setIsSearching(false);
            setRemoteResults([]);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            setIsSearching(true);
            try {
                const sessionIds = sessions.map((session) => session.id).filter(Boolean).join(',');
                const params = new URLSearchParams({ search: trimmedQuery });
                if (sessionIds) {
                    params.set('session_ids', sessionIds);
                }

                const response = await api.fetch(`/history?${params.toString()}`, {
                    signal: controller.signal,
                });

                if (response.ok) {
                    const payload = await response.json() as ChatSession[];
                    setRemoteResults(Array.isArray(payload) ? payload : []);
                }
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('Failed to search chats:', error);
                    setRemoteResults([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsSearching(false);
                }
            }
        }, 180);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [isOpen, query, sessions]);

    const filteredSessions = useMemo(() => {
        if (!query.trim()) return sessions;
        return remoteResults;
    }, [query, remoteResults, sessions]);

    const grouped = useMemo(() => {
        const groups: Record<string, ChatSession[]> = {
            'Today': [],
            'Yesterday': [],
            'Previous 7 Days': [],
            'Older': []
        };
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        filteredSessions.forEach(session => {
            const timestamp = session.updated_at || session.created_at;
            if (!timestamp) return;
            const date = new Date(timestamp);
            date.setHours(0, 0, 0, 0);

            if (date.getTime() === today.getTime()) {
                groups['Today'].push(session);
            } else if (date.getTime() === yesterday.getTime()) {
                groups['Yesterday'].push(session);
            } else if (date.getTime() >= sevenDaysAgo.getTime()) {
                groups['Previous 7 Days'].push(session);
            } else {
                groups['Older'].push(session);
            }
        });
        return groups;
    }, [filteredSessions]);

    const renderHighlightedText = (text: string, searchQuery: string, muted = false) => {
        const trimmedQuery = searchQuery.trim();
        if (!trimmedQuery) {
            return <span>{text}</span>;
        }

        const pattern = new RegExp(`(${trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
        const parts = text.split(pattern);

        return (
            <>
                {parts.map((part, index) => (
                    part.toLowerCase() === trimmedQuery.toLowerCase() ? (
                        <mark
                            key={`${part}-${index}`}
                            className={muted ? 'rounded bg-primary/15 px-0.5 text-foreground' : 'rounded bg-primary/20 px-0.5 text-foreground'}
                        >
                            {part}
                        </mark>
                    ) : (
                        <span key={`${part}-${index}`}>{part}</span>
                    )
                ))}
            </>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[70vh] animate-in slide-in-from-top-4 duration-300 font-sans"
                onClick={e => e.stopPropagation()}
            >
                {/* Search Header */}
                <div className="flex items-center gap-3 px-4 py-4 border-b border-border bg-card shadow-sm z-10">
                    <Search className="w-5 h-5 text-muted-foreground" />
                    <input
                        type="text"
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search chats..."
                        className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground font-sans text-base"
                    />
                    <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto px-2 py-4 space-y-6 bg-card">
                    {isSearching ? (
                        <div className="px-4 text-sm text-muted-foreground">Searching chats...</div>
                    ) : null}
                    {Object.entries(grouped).map(([label, groupSessions]) => {
                        if (groupSessions.length === 0) return null;
                        return (
                            <div key={label} className="px-2">
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 px-3 uppercase tracking-wider">
                                    {label}
                                </h4>
                                <div className="space-y-1">
                                    {groupSessions.map(session => (
                                        <button
                                            key={session.id}
                                            onClick={() => {
                                                onSelectSession(session.id);
                                                onClose();
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted/50 rounded-lg transition-colors text-left"
                                        >
                                            <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0 self-start mt-0.5" />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-medium">
                                                    {renderHighlightedText(session.title, query)}
                                                </div>
                                                {session.search_preview ? (
                                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                        {renderHighlightedText(session.search_preview, query, true)}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {filteredSessions.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground text-sm">
                            No chats found matching "{query}"
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
