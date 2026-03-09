"use client";
import React, { useState, useEffect, createContext, useContext } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import AppSidebar from "@/components/AppSidebar";
import PersonalInformationModal from "@/components/PersonalInformationModal";
import ReportProblemModal from "@/components/ReportProblemModal";
import SearchChatsModal from "@/components/SearchChatsModal";
import SettingsModal from "@/components/SettingsModal";
import type { MainUser } from "@/components/main/types";
import { ChatSessionProvider, useChatSession } from "@/lib/ChatSessionContext";
import { PROFILE_UPDATED_EVENT, type ProfileUpdateDetail } from "@/lib/profile-events";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";

// ── Sidebar trigger context ──────────────────────────────────────────────────
// Allows any child page to call openSidebar() without prop drilling.
export const SidebarTriggerContext = createContext<() => void>(() => { });
export const useSidebarTrigger = () => useContext(SidebarTriggerContext);

// ── Inner layout — runs inside ChatSessionProvider so it can call useChatSession
function AppLayoutContent({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { clearHistory, deleteSession, sessions, setSessions, setActiveSessionId, activeSessionId } = useChatSession();

    // Hide sidebar entirely on the quiz-taking page (/quiz/[id]) for focus mode.
    // Still show it on /quiz, /quiz/history, /quiz/[id]/results.
    const isQuizTaking = /^\/quiz\/[^/]+$/.test(pathname ?? '');

    // On desktop: true = expanded (w-64), false = icon-only (w-14)
    // On mobile: true = slide-in overlay, false = slide off
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isPersonalInfoOpen, setIsPersonalInfoOpen] = useState(false);
    const [isReportProblemOpen, setIsReportProblemOpen] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState("");
    const [isRenameSaving, setIsRenameSaving] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [shellUser, setShellUser] = useState<Exclude<MainUser, null> | null>(null);

    const handleConfirmDelete = async () => {
        if (!deleteTargetId) return;
        await deleteSession(deleteTargetId);
        if (activeSessionId === deleteTargetId) setActiveSessionId(null);
        setIsDeleteModalOpen(false);
        setDeleteTargetId(null);
    };

    const handleConfirmRename = async () => {
        if (!renamingChatId || !renameDraft.trim()) return;
        setIsRenameSaving(true);
        try {
            const nextTitle = renameDraft.trim();
            const res = await api.patch(`/history/${renamingChatId}/rename`, { title: nextTitle });
            if (res.ok) {
                setSessions(prev => prev.map(s =>
                    s.id === renamingChatId ? { ...s, title: nextTitle } : s
                ));
            }
        } catch (err) {
            console.error("Rename failed:", err);
        } finally {
            setIsRenameSaving(false);
            setRenamingChatId(null);
            setRenameDraft("");
        }
    };

    useEffect(() => {
        if (typeof window !== "undefined" && window.innerWidth < 768) {
            setIsSidebarOpen(false);
        }
    }, []);

    // Auto-close sidebar on mobile whenever the route changes
    useEffect(() => {
        if (typeof window !== "undefined" && window.innerWidth < 768) {
            setIsSidebarOpen(false);
        }
    }, [pathname]);

    useEffect(() => {
        const loadShellUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                setShellUser(null);
                setIsAdmin(false);
                return;
            }

            const response = await api.get('/me/bootstrap');
            if (!response.ok) {
                setIsAdmin(false);
                setShellUser({
                    id: session.user.id,
                    email: session.user.email || '',
                    name: session.user.user_metadata?.full_name || '',
                    avatarUrl: session.user.user_metadata?.avatar_url || '',
                    level: session.user.user_metadata?.level || '',
                    university: session.user.user_metadata?.university || '',
                    subscriptionTier: 'free',
                });
                return;
            }

            const data = await response.json();
            const profile = data?.profile;
            setShellUser({
                id: session.user.id,
                email: session.user.email || '',
                name:
                    profile?.full_name ||
                    [profile?.first_name, profile?.other_names].filter(Boolean).join(' ').trim() ||
                    session.user.user_metadata?.full_name ||
                    '',
                avatarUrl: profile?.avatar_url || session.user.user_metadata?.avatar_url || '',
                level: profile?.level || session.user.user_metadata?.level || '',
                university: profile?.university || session.user.user_metadata?.university || '',
                subscriptionTier: profile?.subscription_tier || 'free',
            });
            setIsAdmin(Boolean(data?.is_admin));
        };

        void loadShellUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session?.user) {
                setShellUser(null);
                setIsSettingsOpen(false);
                setIsPersonalInfoOpen(false);
                setIsReportProblemOpen(false);
            } else {
                void loadShellUser();
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        const handleProfileUpdated = (event: Event) => {
            const detail = (event as CustomEvent<ProfileUpdateDetail>).detail;
            if (!detail) return;

            setShellUser(prev => prev ? {
                ...prev,
                name: detail.name ?? prev.name,
                avatarUrl: detail.avatarUrl ?? prev.avatarUrl,
                level: detail.level ?? prev.level,
                university: detail.university ?? prev.university,
                subscriptionTier: detail.subscriptionTier ?? prev.subscriptionTier,
            } : prev);
        };

        window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
        return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
    }, []);

    const handleLogout = async () => {
        if (typeof window !== "undefined" && window.localStorage) {
            localStorage.removeItem("deviceId");
        }

        await supabase.auth.signOut();
        window.location.replace("/login");
    };

    const handleDeleteAccount = async () => {
        const response = await api.delete("/me/account");
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || "Failed to delete account");
        }

        await handleLogout();
    };

    const handleClearHistory = async () => {
        await clearHistory();
        setActiveSessionId(null);
    };

    return (
        <SidebarTriggerContext.Provider value={() => setIsSidebarOpen(true)}>
            <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
                {/* Mobile overlay */}
                {isSidebarOpen && !isQuizTaking && (
                    <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />
                )}

                {/* Sidebar — hidden on quiz taking pages */}
                {!isQuizTaking && (
                    <AppSidebar
                        isOpen={isSidebarOpen}
                        onClose={() => setIsSidebarOpen(prev => !prev)}
                        onSearchOpen={() => setIsSearchModalOpen(true)}
                        onOpenReportProblem={() => setIsReportProblemOpen(true)}
                        onOpenSettings={() => setIsSettingsOpen(true)}
                        onDeleteRequest={(id) => { setDeleteTargetId(id); setIsDeleteModalOpen(true); }}
                        onRenameRequest={(id, title) => { setRenamingChatId(id); setRenameDraft(title); }}
                        isAdmin={isAdmin}
                    />
                )}

                {/* Main content area */}
                <div className="flex-1 min-w-0 overflow-hidden">
                    {children}
                </div>
            </div>

            {/* Search Chats Modal — triggered by the 🔍 button in the sidebar History header */}
            <SearchChatsModal
                isOpen={isSearchModalOpen}
                onClose={() => setIsSearchModalOpen(false)}
                sessions={sessions}
                onSelectSession={(id) => {
                    setActiveSessionId(id);
                    setIsSearchModalOpen(false);
                    // If user is not on the chat page, navigate there so the session loads
                    if (typeof window !== "undefined" && window.location.pathname !== "/main") {
                        router.push("/main");
                    }
                }}
            />

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                                <Trash2 className="w-5 h-5 text-destructive" />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground">Delete Chat</h3>
                                <p className="text-sm text-muted-foreground">This cannot be undone.</p>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => { setIsDeleteModalOpen(false); setDeleteTargetId(null); }}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void handleConfirmDelete()}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:bg-destructive/90 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rename Modal */}
            {renamingChatId && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <Pencil className="w-5 h-5 text-primary" />
                                </div>
                                <h3 className="font-bold text-foreground">Rename Chat</h3>
                            </div>
                            <button
                                onClick={() => { setRenamingChatId(null); setRenameDraft(""); }}
                                className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void handleConfirmRename();
                                if (e.key === "Escape") { setRenamingChatId(null); setRenameDraft(""); }
                            }}
                            autoFocus
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all mb-4"
                            placeholder="Chat name..."
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setRenamingChatId(null); setRenameDraft(""); }}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void handleConfirmRename()}
                                disabled={!renameDraft.trim() || isRenameSaving}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isRenameSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {isRenameSaving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                onOpenPersonalInfo={() => setIsPersonalInfoOpen(true)}
                onLogout={handleLogout}
                onDeleteAccount={handleDeleteAccount}
                onClearHistory={handleClearHistory}
                user={shellUser}
            />

            {shellUser && (
                <PersonalInformationModal
                    isOpen={isPersonalInfoOpen}
                    onClose={() => setIsPersonalInfoOpen(false)}
                    user={shellUser}
                    onSave={(data) => {
                        setShellUser((prev) => prev ? {
                            ...prev,
                            name: data.name,
                            level: data.level,
                            university: data.university,
                        } : prev);
                    }}
                    onAvatarChange={(url) => {
                        setShellUser((prev) => prev ? { ...prev, avatarUrl: url } : prev);
                    }}
                />
            )}

            <ReportProblemModal
                isOpen={isReportProblemOpen}
                onClose={() => setIsReportProblemOpen(false)}
            />
        </SidebarTriggerContext.Provider>
    );
}

// ── Outer layout — provides ChatSessionProvider then renders the inner layout
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <ChatSessionProvider>
            <AppLayoutContent>{children}</AppLayoutContent>
        </ChatSessionProvider>
    );
}
