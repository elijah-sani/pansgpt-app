"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ChatSession, useChatHistory } from "@/hooks/useChatHistory";

const ACTIVE_SESSION_STORAGE_KEY = "pansgpt_active_session";

interface ChatSessionContextType {
    sessions: ChatSession[];
    setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
    isLoadingHistory: boolean;
    hasLoadedHistory: boolean;
    activeSessionId: string | null;
    setActiveSessionId: (id: string | null) => void;
    fetchHistory: (contextId?: string, force?: boolean) => void;
    createSession: (title: string, contextId?: string) => Promise<any>;
    deleteSession: (id: string) => Promise<void>;
    deletingId: string | null;
    loadSession: (id: string) => Promise<any[]>;
    clearHistory: () => void;
}

const ChatSessionContext = createContext<ChatSessionContextType | null>(null);

export function ChatSessionProvider({ children }: { children: ReactNode }) {
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const chatHistory = useChatHistory();

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const storedSessionId = window.sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
        if (storedSessionId) {
            setActiveSessionId(storedSessionId);
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        if (activeSessionId) {
            window.sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
        } else {
            window.sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        }
    }, [activeSessionId]);

    return (
        <ChatSessionContext.Provider value={{
            ...chatHistory,
            activeSessionId,
            setActiveSessionId,
        }}>
            {children}
        </ChatSessionContext.Provider>
    );
}

export function useChatSession() {
    const ctx = useContext(ChatSessionContext);
    if (!ctx) throw new Error("useChatSession must be used within ChatSessionProvider");
    return ctx;
}
