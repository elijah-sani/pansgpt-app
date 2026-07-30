// [DESKTOP UI]
"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DesktopMainHeader } from "@/components/desktop/DesktopMainHeader";
import { DesktopTitleBar } from "@/components/desktop/DesktopTitleBar"; // [DESKTOP CUSTOM TITLEBAR]
import DesktopSidebar from "@/components/desktop/DesktopSidebar";
import { DocumentTabsProvider, useDocumentTabs } from "@/lib/DocumentTabsContext"; // [DESKTOP UI]
import SearchChatsModal from "@/components/SearchChatsModal";
import SettingsModal from "@/components/SettingsModal";
import ReportProblemModal from "@/components/ReportProblemModal";
import PersonalInformationModal from "@/components/PersonalInformationModal";
import ProfileSidebar from "@/components/ProfileSidebar"; // [DESKTOP UI]
import QuizPerformanceModal from "@/components/QuizPerformanceModal"; // [DESKTOP UI]
import WeeklyTimetableModal from "@/components/WeeklyTimetableModal"; // [DESKTOP UI]
import { useChatSession } from "@/lib/ChatSessionContext";
import LocalErrorBoundary from "@/components/LocalErrorBoundary";
import ErrorRecoveryView from "@/components/ErrorRecoveryView";
import type { MainUser } from "@/components/main/types";
import { fetchBootstrap } from "@/lib/bootstrap-cache";
import { supabase } from "@/lib/supabase";
// [DESKTOP UI SECURITY]
import { useStudentRestrictions } from "@/hooks/useStudentRestrictions";
import { StudentRestrictionBlocker } from "@/components/StudentRestrictionBlocker";
import UniversitySuspendedBlocker from "@/components/UniversitySuspendedBlocker";

export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return (
    <DocumentTabsProvider>
      <DesktopLayoutContent>{children}</DesktopLayoutContent>
    </DocumentTabsProvider>
  );
}

function DesktopLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeSessionId, setActiveSessionId, sessions, clearHistory } = useChatSession();
  const { openTabs, activeTabId } = useDocumentTabs(); // [DESKTOP UI]

  const isDocTabActive = Boolean(activeTabId && openTabs.some((t) => t.id === activeTabId));

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportProblemOpen, setIsReportProblemOpen] = useState(false);
  const [isPersonalInfoOpen, setIsPersonalInfoOpen] = useState(false);
  const [isProfileSidebarOpen, setIsProfileSidebarOpen] = useState(false); // [DESKTOP UI]
  const [isQuizPerformanceOpen, setIsQuizPerformanceOpen] = useState(false); // [DESKTOP UI]
  const [isWeeklyTimetableOpen, setIsWeeklyTimetableOpen] = useState(false); // [DESKTOP UI]
  const [isAdmin, setIsAdmin] = useState(false); // [DESKTOP UI]
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [shellUser, setShellUser] = useState<MainUser | null>(null);

  // [DESKTOP UI SECURITY] Shared student restriction & suspension state
  const {
    restriction,
    restrictionNow,
    isUniversitySuspended,
    setIsUniversitySuspended,
    loadRestrictionStatus,
  } = useStudentRestrictions();

  // [DESKTOP UI SECURITY] [DESKTOP AUTH PERSISTENCE] Layout-level session & restriction verification
  useEffect(() => {
    let isMounted = true;

    const loadDesktopShell = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (!session?.user) {
          setShellUser(null);
          setIsAdmin(false);
          router.replace("/login");
          return;
        }

        const data = await fetchBootstrap();
        if (isMounted && data) {
          setIsAdmin(Boolean((data as Record<string, unknown>)?.is_admin)); // [DESKTOP UI]
          setIsUniversitySuspended(Boolean((data as Record<string, unknown>)?.is_university_suspended));
          if (data.profile) {
            setShellUser({
              id: session.user.id,
              name: data.profile.full_name || "User",
              email: session.user.email || "",
              level: data.profile.level || "300L",
              university: data.profile.university || data.university_name || "PansGPT University",
              avatarUrl: data.profile.avatar_url || "",
            });
          }
          void loadRestrictionStatus({ foreground: true });
        }
      } catch {}
    };

    void loadDesktopShell();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (!session?.user) {
        setShellUser(null);
        setIsAdmin(false);
        router.replace("/login");
      } else {
        void loadDesktopShell();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadRestrictionStatus, router, setIsUniversitySuspended]);

  const handleNewChat = () => {
    setActiveSessionId(null);
    router.push("/study");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleDeleteAccount = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // [DESKTOP UI SECURITY] Access Control Blocker rendering
  if (isUniversitySuspended) {
    return <UniversitySuspendedBlocker onLogout={handleLogout} />;
  }

  if (restriction) {
    return <StudentRestrictionBlocker restriction={restriction} now={restrictionNow} />;
  }

  return (
    <>
      <div className="desktop-shell flex flex-col h-[100dvh] w-full overflow-hidden bg-background select-none">
        {/* Custom Frameless Title Bar (Notion Style) */}
        <DesktopTitleBar onOpenSidebar={() => setIsSidebarOpen((prev) => !prev)} />

        {/* Desktop Global Top Header — Hidden when a document tab is active */}
        {!isDocTabActive && (
          <DesktopMainHeader
            desktopOnly
            activeSessionId={activeSessionId}
            isProfileOpen={isProfileSidebarOpen}
            onNewChat={handleNewChat}
            onOpenProfile={() => setIsProfileSidebarOpen(true)} // [DESKTOP UI]
            onOpenSidebar={() => setIsSidebarOpen((prev) => !prev)}
            onSearchOpen={() => setIsSearchModalOpen(true)}
            sessions={sessions}
            user={shellUser}
          />
        )}

        {/* Main Body with Desktop Sidebar — Sidebar hidden when a document tab is active */}
        <div className="flex flex-1 min-h-0 w-full overflow-hidden">
          {!isDocTabActive && (
            <LocalErrorBoundary
              boundaryName="desktop-app-sidebar"
              fallback={({ error, retry }) => (
                <div className="hidden h-full w-[22rem] shrink-0 border-r border-border bg-card/90 md:flex md:items-center md:justify-center md:p-4">
                  <ErrorRecoveryView
                    title="Sidebar unavailable"
                    description="The desktop sidebar hit an unexpected problem."
                    errorMessage={error.message}
                    retryLabel="Retry Sidebar"
                    onRetry={retry}
                    secondaryLabel="Go Home"
                    onSecondaryAction={() => router.push("/study")}
                  />
                </div>
              )}
            >
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
            </LocalErrorBoundary>
          )}

          <main className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
            {children}
          </main>
        </div>
      </div>

      {/* Shared Modals for Desktop */}
      {isSearchModalOpen && (
        <SearchChatsModal
          isOpen={isSearchModalOpen}
          onClose={() => setIsSearchModalOpen(false)}
          sessions={sessions}
          onSelectSession={(id) => {
            setActiveSessionId(id);
            setIsSearchModalOpen(false);
            if (typeof window !== "undefined" && window.location.pathname !== "/study") {
              router.push("/study");
            }
          }}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenPersonalInfo={() => setIsPersonalInfoOpen(true)}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        onClearHistory={clearHistory}
        user={shellUser}
        onOpenReportProblem={() => setIsReportProblemOpen(true)}
      />

      {/* [DESKTOP UI] Profile Popover Dropdown */}
      {isProfileSidebarOpen && (
        <div
          className="fixed inset-0 z-[150] bg-transparent"
          onClick={() => setIsProfileSidebarOpen(false)}
        >
          <div
            className="absolute right-4 top-20 z-[151] w-76 flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <ProfileSidebar
              user={{
                name: shellUser?.name || "User",
                email: shellUser?.email || "",
                avatarUrl: shellUser?.avatarUrl || "",
                university: shellUser?.university || "PansGPT University",
                level: shellUser?.level || "300L",
                subscriptionTier: shellUser?.subscriptionTier || "free",
              }}
              isAdmin={isAdmin}
              hideBackButton={true}
              onClose={() => setIsProfileSidebarOpen(false)}
              onOpenPersonalInfo={() => {
                setIsProfileSidebarOpen(false);
                setIsPersonalInfoOpen(true);
              }}
              onOpenQuizPerformance={() => {
                setIsProfileSidebarOpen(false);
                setIsQuizPerformanceOpen(true);
              }}
              onOpenTimetable={() => {
                setIsProfileSidebarOpen(false);
                setIsWeeklyTimetableOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {shellUser && (
        <PersonalInformationModal
          isOpen={isPersonalInfoOpen}
          onClose={() => setIsPersonalInfoOpen(false)}
          user={shellUser}
          onSave={(data) => {
            setShellUser((prev) => (prev ? {
              ...prev,
              name: data.name,
              level: data.level,
              university: data.university,
            } : prev));
          }}
          onAvatarChange={(url) => {
            setShellUser((prev) => (prev ? { ...prev, avatarUrl: url } : prev));
          }}
        />
      )}

      {/* [DESKTOP UI] Profile Sub-Modals */}
      <QuizPerformanceModal
        isOpen={isQuizPerformanceOpen}
        onClose={() => setIsQuizPerformanceOpen(false)}
      />
      <WeeklyTimetableModal
        isOpen={isWeeklyTimetableOpen}
        onClose={() => setIsWeeklyTimetableOpen(false)}
      />

      {isReportProblemOpen && (
        <ReportProblemModal
          isOpen={isReportProblemOpen}
          onClose={() => setIsReportProblemOpen(false)}
        />
      )}
    </>
  );
}
