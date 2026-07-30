"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Clock3, Loader2, Pencil, ShieldAlert, Trash2, X } from "lucide-react";
import AppSidebar from "@/components/AppSidebar";
import MainLoading from "./main/loading";
import ReaderLoading from "./reader/loading";
import QuizLoading from "./quiz/loading";
import OfflineBanner from "@/components/OfflineBanner";
import PersonalInformationModal from "@/components/PersonalInformationModal";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import ReportProblemModal from "@/components/ReportProblemModal";
import SearchChatsModal from "@/components/SearchChatsModal";
import SettingsModal from "@/components/SettingsModal";
import UniversitySuspendedBlocker from "@/components/UniversitySuspendedBlocker";
import LocalErrorBoundary from "@/components/LocalErrorBoundary";
import ErrorRecoveryView from "@/components/ErrorRecoveryView";
import type { MainUser } from "@/components/main/types";
import { useChatSession } from "@/lib/ChatSessionContext";
import { PROFILE_UPDATED_EVENT, type ProfileUpdateDetail } from "@/lib/profile-events";
import { SidebarControlsContext } from "@/lib/sidebar-controls";
import { fetchBootstrap } from "@/lib/bootstrap-cache";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { clearAdminWorkspaceUniversity } from "@/lib/admin-workspace";
import { buildWhatsAppSupportUrl } from "@/lib/support-config";
import { useStudentRestrictions, type ActiveRestriction } from "@/hooks/useStudentRestrictions";
import { StudentRestrictionBlocker } from "@/components/StudentRestrictionBlocker";

// [DESKTOP UI]
import { DesktopTitleBar } from "@/components/desktop/DesktopTitleBar";
import { DesktopMainHeader } from "@/components/desktop/DesktopMainHeader";
import DesktopSidebar from "@/components/desktop/DesktopSidebar";
import { DocumentTabStrip } from "@/components/desktop/DocumentTabStrip";
import { DocumentTabsProvider } from "@/lib/DocumentTabsContext";
import ProfileSidebar from "@/components/ProfileSidebar";
import QuizPerformanceModal from "@/components/QuizPerformanceModal";
import WeeklyTimetableModal from "@/components/WeeklyTimetableModal";

function AppLayoutContent({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { clearHistory, deleteSession, sessions, setSessions, setActiveSessionId, activeSessionId, pendingPath, setPendingPath } = useChatSession();
    const [isDesktop, setIsDesktop] = useState(false);
    const [isQuizPerformanceOpen, setIsQuizPerformanceOpen] = useState(false);
    const [isWeeklyTimetableOpen, setIsWeeklyTimetableOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined" && ((window as any).electronAPI || window.location.pathname.startsWith("/study"))) {
            setIsDesktop(true);
        }
    }, []);

    useEffect(() => {
        setPendingPath(null);
    }, [pathname, setPendingPath]);

    const isQuizTaking = /^\/quiz\/generating\/[^/]+$/.test(pathname ?? "")
        || /^\/quiz\/(?!history$|new$|generating$)[^/]+$/.test(pathname ?? "");

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
    const {
        restriction,
        setRestriction,
        isRestrictionLoading,
        restrictionNow,
        isUniversitySuspended,
        setIsUniversitySuspended,
        loadRestrictionStatus,
        resetRestrictions,
    } = useStudentRestrictions();
    const hasResolvedInitialShellRef = useRef(false);
    const isLoadingShellUserRef = useRef(false);
    const sidebarTouchStartRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        setIsSidebarOpen(window.innerWidth >= 768);
    }, []);

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
                setSessions((prev) => prev.map((s) =>
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
        if (typeof window === "undefined") {
            return;
        }

        const shouldCloseSidebar = window.innerWidth < 768 || pathname?.startsWith("/notes") || pathname?.startsWith("/reader");
        if (!shouldCloseSidebar) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setIsSidebarOpen(false);
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [pathname]);

    useEffect(() => {
        const loadShellUser = async () => {
            if (isLoadingShellUserRef.current) return;
            isLoadingShellUserRef.current = true;
            try {
                const isInitialShellLoad = !hasResolvedInitialShellRef.current;
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.user) {
                    setShellUser(null);
                    setIsAdmin(false);
                    resetRestrictions();
                    hasResolvedInitialShellRef.current = false;
                    return;
                }

                const data = await fetchBootstrap();
                if (!data) {
                    setIsAdmin(false);
                    setShellUser({
                        id: session.user.id,
                        email: session.user.email || "",
                        name: session.user.user_metadata?.full_name || "",
                        avatarUrl: session.user.user_metadata?.avatar_url || "",
                        level: session.user.user_metadata?.level || "",
                        university: session.user.user_metadata?.university || "",
                        subscriptionTier: "free",
                    });
                    resetRestrictions();
                    hasResolvedInitialShellRef.current = true;
                    return;
                }

                if (data?.is_lecturer) {
                    if (data.lecturer_status === "active") {
                        router.replace("/lecturer");
                        return;
                    }

                    if (data.lecturer_status === "pending") {
                        router.replace("/lecturer/pending");
                        return;
                    }

                    if (data.lecturer_status && ["rejected", "suspended", "revoked"].includes(data.lecturer_status)) {
                        router.replace("/lecturer");
                        return;
                    }

                    router.replace("/lecturer");
                    return;
                }

                const profile = data?.profile;
                setShellUser({
                    id: session.user.id,
                    email: session.user.email || "",
                    name:
                        profile?.full_name ||
                        [profile?.first_name, profile?.other_names].filter(Boolean).join(" ").trim() ||
                        session.user.user_metadata?.full_name ||
                        "",
                    avatarUrl: profile?.avatar_url || session.user.user_metadata?.avatar_url || "",
                    level: profile?.level || session.user.user_metadata?.level || "",
                    university: profile?.university || session.user.user_metadata?.university || "",
                    subscriptionTier: profile?.subscription_tier || "free",
                });
                setIsAdmin(Boolean(data?.is_admin));
                setIsUniversitySuspended(Boolean((data as Record<string, unknown>)?.is_university_suspended));
                await loadRestrictionStatus({ foreground: isInitialShellLoad });
                hasResolvedInitialShellRef.current = true;
            } finally {
                isLoadingShellUserRef.current = false;
            }
        };

        void loadShellUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session?.user) {
                setShellUser(null);
                setIsSettingsOpen(false);
                setIsPersonalInfoOpen(false);
                setIsReportProblemOpen(false);
                resetRestrictions();
                hasResolvedInitialShellRef.current = false;
            } else {
                void loadShellUser();
            }
        });

        return () => subscription.unsubscribe();
    }, [loadRestrictionStatus, resetRestrictions, router, setIsUniversitySuspended]);

    useEffect(() => {
        const handleProfileUpdated = (event: Event) => {
            const detail = (event as CustomEvent<ProfileUpdateDetail>).detail;
            if (!detail) return;

            setShellUser((prev) => prev ? {
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

    useEffect(() => {
        if (!shellUser || typeof window === "undefined") {
            return;
        }

        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get("profile") !== "1") {
            return;
        }

        setIsPersonalInfoOpen(true);

        currentUrl.searchParams.delete("profile");
        const nextQuery = currentUrl.searchParams.toString();
        const nextUrl = `${pathname || "/main"}${nextQuery ? `?${nextQuery}` : ""}`;
        router.replace(nextUrl);
    }, [pathname, router, shellUser]);

    const handleLogout = async () => {
        if (typeof window !== "undefined" && window.localStorage) {
            localStorage.removeItem("deviceId");
        }

        clearAdminWorkspaceUniversity();
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

    const handleShellTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        if (typeof window === "undefined" || window.innerWidth >= 768 || isQuizTaking) {
            return;
        }

        const touch = event.touches[0];
        if (!touch) {
            return;
        }

        sidebarTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleShellTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
        const start = sidebarTouchStartRef.current;
        sidebarTouchStartRef.current = null;
        if (!start || typeof window === "undefined" || window.innerWidth >= 768 || isQuizTaking) {
            return;
        }

        const touch = event.changedTouches[0];
        if (!touch) {
            return;
        }

        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;
        if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) {
            return;
        }

        if (!isSidebarOpen && start.x <= 28 && deltaX > 0) {
            setIsSidebarOpen(true);
        }

        if (isSidebarOpen && deltaX < 0) {
            setIsSidebarOpen(false);
        }
    };

    return (
        <SidebarControlsContext.Provider
            value={{
                isOpen: isSidebarOpen,
                open: () => setIsSidebarOpen(true),
                close: () => setIsSidebarOpen(false),
                toggle: () => setIsSidebarOpen((prev) => !prev),
            }}
        >
            {isDesktop ? (
                <DocumentTabsProvider>
                    <div className="desktop-shell flex flex-col h-[100dvh] w-full overflow-hidden bg-background select-none">
                        <DesktopTitleBar onOpenSidebar={() => setIsSidebarOpen((prev) => !prev)} />
                        <DesktopMainHeader
                            desktopOnly
                            activeSessionId={activeSessionId}
                            user={shellUser}
                            isProfileOpen={isProfileOpen}
                            onOpenProfile={() => setIsProfileOpen(true)}
                            onOpenSidebar={() => setIsSidebarOpen((prev) => !prev)}
                            onSearchOpen={() => setIsSearchModalOpen(true)}
                        />
                        <div className="flex flex-1 min-h-0 w-full overflow-hidden relative">
                            <DesktopSidebar
                                isOpen={isSidebarOpen}
                                onClose={() => setIsSidebarOpen((prev) => !prev)}
                                onSearchOpen={() => setIsSearchModalOpen(true)}
                                onOpenReportProblem={() => setIsReportProblemOpen(true)}
                                onOpenSettings={() => setIsSettingsOpen(true)}
                                onOpenTimetable={() => setIsWeeklyTimetableOpen(true)}
                                onDeleteRequest={(id) => {
                                    setDeleteTargetId(id);
                                    setIsDeleteModalOpen(true);
                                }}
                                onRenameRequest={(id, title) => {
                                    setRenamingChatId(id);
                                    setRenameDraft(title);
                                }}
                            />
                            <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
                                <main className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
                                    {children}
                                </main>
                            </div>
                        </div>
                    </div>

                    {/* [DESKTOP UI] Profile Popover Dropdown */}
                    {isProfileOpen && shellUser && (
                        <div
                            className="fixed inset-0 z-[150] bg-transparent"
                            onClick={() => setIsProfileOpen(false)}
                        >
                            <div
                                className="absolute right-4 top-20 z-[151] w-76 flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <ProfileSidebar
                                    user={shellUser}
                                    isAdmin={isAdmin}
                                    hideBackButton={true}
                                    onClose={() => setIsProfileOpen(false)}
                                    onOpenPersonalInfo={() => {
                                        setIsProfileOpen(false);
                                        setIsPersonalInfoOpen(true);
                                    }}
                                    onOpenQuizPerformance={() => {
                                        setIsProfileOpen(false);
                                        setIsQuizPerformanceOpen(true);
                                    }}
                                    onOpenTimetable={() => {
                                        setIsProfileOpen(false);
                                        setIsWeeklyTimetableOpen(true);
                                    }}
                                />
                            </div>
                        </div>
                    )}
                    <QuizPerformanceModal
                        isOpen={isQuizPerformanceOpen}
                        onClose={() => setIsQuizPerformanceOpen(false)}
                    />
                    <WeeklyTimetableModal
                        isOpen={isWeeklyTimetableOpen}
                        onClose={() => setIsWeeklyTimetableOpen(false)}
                    />
                    <SettingsModal
                        isOpen={isSettingsOpen}
                        onClose={() => setIsSettingsOpen(false)}
                        onOpenPersonalInfo={() => setIsPersonalInfoOpen(true)}
                        onLogout={handleLogout}
                        onDeleteAccount={handleDeleteAccount}
                        onClearHistory={handleClearHistory}
                        user={shellUser}
                        onOpenReportProblem={() => setIsReportProblemOpen(true)}
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
                </DocumentTabsProvider>
            ) : isUniversitySuspended ? (
                <UniversitySuspendedBlocker onLogout={handleLogout} />
            ) : restriction ? (
                <StudentRestrictionBlocker restriction={restriction} now={restrictionNow} />
            ) : (
                <>
                    <div
                        className="flex h-[100dvh] w-full overflow-hidden bg-background"
                        onTouchStart={handleShellTouchStart}
                        onTouchEnd={handleShellTouchEnd}
                    >
                        {!isQuizTaking && (
                            <LocalErrorBoundary
                                boundaryName="student-app-sidebar"
                                fallback={({ error, retry }) => (
                                    <div className="hidden h-[100dvh] w-[22rem] shrink-0 border-r border-border bg-card/90 md:flex md:items-center md:justify-center md:p-4">
                                        <ErrorRecoveryView
                                            title="Sidebar unavailable"
                                            description="The student sidebar hit an unexpected problem. Retry the shell panel without reloading the whole page."
                                            errorMessage={error.message}
                                            retryLabel="Retry Sidebar"
                                            onRetry={retry}
                                            secondaryLabel="Go Home"
                                            onSecondaryAction={() => window.location.assign('/main')}
                                        />
                                    </div>
                                )}
                            >
                                <AppSidebar
                                    isOpen={isSidebarOpen}
                                    onClose={() => setIsSidebarOpen((prev) => !prev)}
                                    onSearchOpen={() => setIsSearchModalOpen(true)}
                                    onOpenReportProblem={() => setIsReportProblemOpen(true)}
                                    onOpenSettings={() => setIsSettingsOpen(true)}
                                    onDeleteRequest={(id) => { setDeleteTargetId(id); setIsDeleteModalOpen(true); }}
                                    onRenameRequest={(id, title) => { setRenamingChatId(id); setRenameDraft(title); }}
                                    isAdmin={isAdmin}
                                />
                            </LocalErrorBoundary>
                        )}

                        <div className={`flex-1 min-w-0 overflow-x-hidden overflow-y-auto transition-transform duration-300 ease-out md:translate-x-0 ${
                            isSidebarOpen && !isQuizTaking ? "max-md:translate-x-full" : "max-md:translate-x-0"
                        } ${!pathname?.startsWith("/reader/") ? "overscroll-none" : ""}`}>
                            {pendingPath === "/reader" ? (
                                <ReaderLoading />
                            ) : pendingPath === "/quiz" ? (
                                <QuizLoading />
                            ) : pendingPath === "/main" ? (
                                <MainLoading />
                            ) : (
                                children
                            )}
                        </div>
                    </div>

                    <LocalErrorBoundary
                        boundaryName="student-chat-search-modal"
                        fallback={({ error, retry }) => (
                            <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[15vh] backdrop-blur-sm">
                                <div className="w-full max-w-lg">
                                    <ErrorRecoveryView
                                        title="Chat search unavailable"
                                        description="The chat search surface failed to render. Retry it or return to the main workspace."
                                        errorMessage={error.message}
                                        retryLabel="Retry Search"
                                        onRetry={retry}
                                        secondaryLabel="Close"
                                        onSecondaryAction={() => setIsSearchModalOpen(false)}
                                        tertiaryLabel="Open Main"
                                        onTertiaryAction={() => {
                                            setIsSearchModalOpen(false);
                                            window.location.assign('/main');
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    >
                        <SearchChatsModal
                            isOpen={isSearchModalOpen}
                            onClose={() => setIsSearchModalOpen(false)}
                            sessions={sessions}
                            onSelectSession={(id) => {
                                setActiveSessionId(id);
                                setIsSearchModalOpen(false);
                                if (typeof window !== "undefined" && window.location.pathname !== "/main") {
                                    router.push("/main");
                                }
                            }}
                        />
                    </LocalErrorBoundary>

                    {isDeleteModalOpen && (
                        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                            <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-sm">
                                <div className="mb-4 flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                                        <Trash2 className="h-5 w-5 text-destructive" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-foreground">Delete Chat</h3>
                                        <p className="text-sm text-muted-foreground">This cannot be undone.</p>
                                    </div>
                                </div>
                                <div className="mt-6 flex gap-3">
                                    <button
                                        onClick={() => { setIsDeleteModalOpen(false); setDeleteTargetId(null); }}
                                        className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => void handleConfirmDelete()}
                                        className="flex-1 rounded-xl bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground transition-colors hover:bg-destructive/90"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {renamingChatId && (
                        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                            <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-sm">
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                            <Pencil className="h-5 w-5 text-primary" />
                                        </div>
                                        <h3 className="font-bold text-foreground">Rename Chat</h3>
                                    </div>
                                    <button
                                        onClick={() => { setRenamingChatId(null); setRenameDraft(""); }}
                                        className="rounded-lg p-1.5 transition-colors hover:bg-muted"
                                    >
                                        <X className="h-4 w-4 text-muted-foreground" />
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
                                    className="mb-4 w-full rounded-xl bg-background px-3 py-2.5 text-base text-foreground outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/20 md:text-sm"
                                    placeholder="Chat name..."
                                />
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setRenamingChatId(null); setRenameDraft(""); }}
                                        className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => void handleConfirmRename()}
                                        disabled={!renameDraft.trim() || isRenameSaving}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                                    >
                                        {isRenameSaving && <Loader2 className="h-4 w-4 animate-spin" />}
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
                        onOpenReportProblem={() => setIsReportProblemOpen(true)}
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
                    <OfflineBanner />
                    <PWAInstallBanner />
                </>
            )}
        </SidebarControlsContext.Provider>
    );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <AppLayoutContent>{children}</AppLayoutContent>
    );
}
