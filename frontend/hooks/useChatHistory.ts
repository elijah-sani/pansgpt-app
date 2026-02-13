import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export interface ChatSession {
    id: string;
    title: string;
    created_at: string;
}

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    image_data?: string;
    images?: string[];
}

export const useChatHistory = () => {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const fetchHistory = useCallback(async (contextId?: string) => {
        setIsLoadingHistory(true);
        try {
            const endpoint = contextId
                ? `/history?context_id=${contextId}`
                : `/history`;

            const res = await api.fetch(endpoint);
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
            }
        } catch (error) {
            console.error("Failed to fetch history:", error);
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    const loadSession = useCallback(async (id: string): Promise<Message[]> => {
        try {
            const res = await api.fetch(`/history/${id}`);
            if (res.ok) {
                return await res.json();
            }
        } catch (error) {
            console.error("Failed to load session:", error);
        }
        return [];
    }, []);

    const createSession = useCallback(async (title?: string, contextId?: string): Promise<ChatSession | null> => {
        try {
            // Note: api.post automatically handles token injection
            const body: any = {};
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
            const res = await api.delete(`/session/${sessionId}`);
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

    return {
        sessions,
        isLoadingHistory,
        fetchHistory,
        loadSession,
        createSession,
        clearHistory,
        deleteSession,
        deletingId
    };
};
