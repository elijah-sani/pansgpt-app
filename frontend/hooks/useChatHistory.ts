import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export interface ChatSession {
    id: string;
    title: string;
    created_at: string;
}

export interface Message {
    role: 'user' | 'assistant' | 'system' | 'ai';
    id?: string | number;
    content: string;
    image_data?: string;
    images?: string[];
    citations?: Array<{ title?: string; course?: string; lecturer?: string }>;
}

export const useChatHistory = () => {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [hasLoadedHistory, setHasLoadedHistory] = useState(false);

    const fetchHistory = useCallback(async (contextId?: string, force = false) => {
        if (hasLoadedHistory && !contextId && !force) {
            return;
        }
        setIsLoadingHistory(true);
        try {
            const endpoint = contextId
                ? `/history?context_id=${contextId}`
                : `/history?is_main=true`;

            const res = await api.fetch(endpoint);
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
                if (!contextId) {
                    setHasLoadedHistory(true);
                }
            }
        } catch (error) {
            console.error("Failed to fetch history:", error);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [hasLoadedHistory]);

    const loadSession = useCallback(async (id: string, limit?: number): Promise<Message[]> => {
        try {
            const params = limit ? `?limit=${limit}` : '';
            const res = await api.fetch(`/history/${id}${params}`);
            if (res.ok) {
                return await res.json();
            }
        } catch (error) {
            console.error("Failed to load session:", error);
        }
        return [];
    }, []);

    const loadOlderMessages = useCallback(async (id: string, beforeTimestamp: string, limit: number = 30): Promise<Message[]> => {
        try {
            const res = await api.fetch(`/history/${id}?limit=${limit}&before=${encodeURIComponent(beforeTimestamp)}`);
            if (res.ok) {
                return await res.json();
            }
        } catch (error) {
            console.error("Failed to load older messages:", error);
        }
        return [];
    }, []);

    const createSession = useCallback(async (title?: string, contextId?: string): Promise<ChatSession | null> => {
        try {
            // Note: api.post automatically handles token injection
            const body: Record<string, string> = {};
            if (title) body.title = title;
            if (contextId) body.context_id = contextId;

            const res = await api.post('/session', body);

            if (res.ok) {
                const session = await res.json();
                setSessions(prev => [session, ...prev]);
                return session;
            } else {
                console.error("Session creation failed:", res.status, res.statusText, await res.text());
            }
        } catch (error) {
            console.error("Failed to create session:", error);
        }
        return null;
    }, []);

    const clearHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const res = await api.delete('/history');
            if (res.ok) {
                setSessions([]);
                setHasLoadedHistory(true);
            }
        } catch (error) {
            console.error("Failed to clear history:", error);
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    const [deletingId, setDeletingId] = useState<string | null>(null);

    const deleteSession = useCallback(async (sessionId: string) => {
        setDeletingId(sessionId);
        try {
            const res = await api.delete(`/history/${sessionId}`);
            if (res.ok) {
                setSessions(prev => prev.filter(s => s.id !== sessionId));
            } else {
                console.error("Failed to delete session");
                alert("Failed to delete chat");
            }
        } catch (error) {
            console.error("Failed to delete session:", error);
            alert("Failed to delete chat");
        } finally {
            setDeletingId(null);
        }
    }, []);

    const updateSessionTitle = useCallback((sessionId: string, newTitle: string) => {
        setSessions(prev => prev.map(s =>
            s.id === sessionId ? { ...s, title: newTitle } : s
        ));
    }, []);

    return {
        sessions,
        setSessions,
        isLoadingHistory,
        hasLoadedHistory,
        fetchHistory,
        loadSession,
        loadOlderMessages,
        createSession,
        clearHistory,
        deleteSession,
        deletingId,
        updateSessionTitle
    };
};
