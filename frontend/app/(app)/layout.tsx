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
import type { MainUser } from "@/components/main/types";
import { ChatSessionProvider, useChatSession } from "@/lib/ChatSessionContext";
import { PROFILE_UPDATED_EVENT, type ProfileUpdateDetail } from "@/lib/profile-events";
import { SidebarControlsContext } from "@/lib/sidebar-controls";
import { fetchBootstrap } from "@/lib/bootstrap-cache";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { clearAdminWorkspaceUniversity } from "@/lib/admin-workspace";
import { buildWhatsAppSupportUrl } from "@/lib/support-config";

type ActiveRestriction = {
    course_code?: string | null;
    course_title?: string | null;
    title?: string | null;
    reason?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    lecturer_title?: string | null;
    lecturer_full_name?: string | null;
    university_name?: string | null;
    level?: string | null;
};

type RestrictionStatusResponse = {
    restricted: boolean;
    restriction: ActiveRestriction | null;
};

function AppLayoutContent({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { clearHistory, deleteSession, sessions, setSessions, setActiveSessionId, activeSessionId, pendingPath, setPendingPath } = useChatSession();

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
    const [restriction, setRestriction] = useState<ActiveRestriction | null>(null);
    const [, setIsRestrictionLoading] = useState(true);
    const [restrictionNow, setRestrictionNow] = useState(() => Date.now());
    const [isUniversitySuspended, setIsUniversitySuspended] = useState(false);
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

    const loadRestrictionStatus = async ({ foreground = false }: { foreground?: boolean } = {}) => {
        if (foreground) {
            setIsRestrictionLoading(true);
        }

        try {
            const response = await api.get("/me/restriction-status");
            if (!response.ok) {
                setRestriction(null);
                return;
            }

            const data = await response.json() as RestrictionStatusResponse;
            setRestriction(data.restricted ? data.restriction : null);
        } catch (error) {
            console.error("Failed to load restriction status:", error);
            setRestriction(null);
        } finally {
            setIsRestrictionLoading(false);
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
                    setRestriction(null);
                    setIsRestrictionLoading(false);
                    setIsUniversitySuspended(false);
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
                    setRestriction(null);
                    setIsRestrictionLoading(false);
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
                setRestriction(null);
                setIsRestrictionLoading(false);
                setIsUniversitySuspended(false);
                hasResolvedInitialShellRef.current = false;
            } else {
                void loadShellUser();
            }
        });

        return () => subscription.unsubscribe();
    }, [router]);

    useEffect(() => {
        if (!restriction) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setRestrictionNow(Date.now());
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [restriction]);

    useEffect(() => {
        if (!restriction?.end_time) {
            return;
        }

        const endAt = new Date(restriction.end_time).getTime();
        if (Number.isNaN(endAt)) {
            return;
        }

        const delay = Math.max(endAt - Date.now(), 0) + 1000;
        const timeoutId = window.setTimeout(() => {
            void loadRestrictionStatus();
        }, delay);

        return () => window.clearTimeout(timeoutId);
    }, [restriction?.end_time]);

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
            {isUniversitySuspended ? (
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

function StudentRestrictionBlocker({
    restriction,
    now,
}: {
    restriction: ActiveRestriction;
    now: number;
}) {
    const courseLabel = restriction.course_code || restriction.course_title || restriction.title || "Current assessment";
    const lecturerName = [restriction.lecturer_title, restriction.lecturer_full_name].filter(Boolean).join(" ").trim() || "Your lecturer";
    const whatsappMessage = [
        "Hello PansGPT Admin, I think this restriction may be wrong or my test has ended.",
        "",
        `Course: ${courseLabel}`,
        `Level: ${restriction.level || "Not specified"}`,
        `Lecturer: ${lecturerName}`,
        `Restriction ends: ${formatRestrictionDateTime(restriction.end_time)}`,
    ].join("\n");
    const whatsappSupportUrl = buildWhatsAppSupportUrl(whatsappMessage);

    return (
        <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-6 py-12">
            <main className="w-full max-w-2xl text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border text-primary">
                    <ShieldAlert className="h-5 w-5" />
                </div>

                <h1 className="mt-5 text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
                    PansGPT is temporarily paused for your level.
                </h1>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                    Access will return automatically when this restriction ends.
                </p>

                <section className="mx-auto mt-8 max-w-sm border-y border-border py-6">
                    <div className="flex items-center justify-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                        <Clock3 className="h-4 w-4" />
                        Time remaining
                    </div>
                    <p className="mt-3 text-4xl font-semibold text-foreground sm:text-5xl">
                        {formatRestrictionCountdown(restriction.end_time, now)}
                    </p>
                </section>

                <dl className="mx-auto mt-8 max-w-xl divide-y divide-border text-left">
                    <RestrictionDetail label="Course" value={courseLabel} />
                    <RestrictionDetail label="Lecturer" value={lecturerName} />
                    <RestrictionDetail label="Message" value={restriction.reason || "Your lecturer has temporarily paused access during this assessment."} />
                    <RestrictionDetail label="Ends at" value={formatRestrictionDateTime(restriction.end_time)} />
                </dl>

                <div className="mx-auto mt-8 max-w-md text-sm leading-6 text-muted-foreground">
                    <p>If your test has ended or this restriction seems wrong, contact admin.</p>
                    <a
                        href={whatsappSupportUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                        Contact admin
                    </a>
                </div>
            </main>
        </div>
    );
}

function RestrictionDetail({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid gap-1 py-4 sm:grid-cols-[8rem_1fr] sm:gap-6">
            <dt className="text-xs font-semibold uppercase text-muted-foreground">{label}</dt>
            <dd className="text-sm leading-6 text-foreground">{value}</dd>
        </div>
    );
}

function formatRestrictionCountdown(value: string | null | undefined, now: number) {
    if (!value) {
        return "—";
    }

    const endTime = new Date(value).getTime();
    if (Number.isNaN(endTime)) {
        return value;
    }

    const remaining = Math.max(endTime - now, 0);
    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
    }

    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatRestrictionDateTime(value: string | null | undefined) {
    if (!value) {
        return "—";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(parsed);
}
