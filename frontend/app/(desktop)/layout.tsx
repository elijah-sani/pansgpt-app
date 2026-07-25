// [DESKTOP UI]
"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DesktopMainHeader } from "@/components/desktop/DesktopMainHeader";
import DesktopSidebar from "@/components/desktop/DesktopSidebar";
import { DocumentTabStrip } from "@/components/desktop/DocumentTabStrip";
import { DocumentTabsProvider } from "@/lib/DocumentTabsContext";
import SearchChatsModal from "@/components/SearchChatsModal";
import SettingsModal from "@/components/SettingsModal";
import ReportProblemModal from "@/components/ReportProblemModal";
import PersonalInformationModal from "@/components/PersonalInformationModal";
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
  const pathname = usePathname();
  const router = useRouter();
  const { activeSessionId, setActiveSessionId, sessions, clearHistory } = useChatSession();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportProblemOpen, setIsReportProblemOpen] = useState(false);
  const [isPersonalInfoOpen, setIsPersonalInfoOpen] = useState(false);
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
          router.replace("/login");
          return;
        }

        const data = await fetchBootstrap();
        if (isMounted && data) {
          setIsUniversitySuspended(Boolean((data as Record<string, unknown>)?.is_university_suspended));
          if (data.profile) {
            setShellUser({
              id: "desktop-user",
              name: data.profile.full_name || "User",
              email: "",
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
    <DocumentTabsProvider>
      <div className="desktop-shell flex flex-col h-[100dvh] w-full overflow-hidden bg-background select-none">
        {/* Desktop Global Top Header */}
        <DesktopMainHeader
          desktopOnly
          activeSessionId={activeSessionId}
          isProfileOpen={isPersonalInfoOpen}
          onNewChat={handleNewChat}
          onOpenProfile={() => setIsPersonalInfoOpen(true)}
          onOpenSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onSearchOpen={() => setIsSearchModalOpen(true)}
          sessions={sessions}
          user={shellUser}
        />

        {/* Horizontal Document Tab Strip */}
        <DocumentTabStrip />

        {/* Main Body with Desktop Sidebar */}
        <div className="flex flex-1 min-h-0 w-full overflow-hidden">
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

          <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto overscroll-none">
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

      {isReportProblemOpen && (
        <ReportProblemModal
          isOpen={isReportProblemOpen}
          onClose={() => setIsReportProblemOpen(false)}
        />
      )}
    </DocumentTabsProvider>
  );
}
