"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Bug, ChevronRight, CircleHelp, FileText, Mail, PanelLeft, Settings } from "lucide-react";
import Logo from "@/components/Logo";
import { useChatSession } from "@/lib/ChatSessionContext";
import { MainSidebarContent } from "@/components/sidebar/MainSidebarContent";
import { StudySidebarContent } from "@/components/sidebar/StudySidebarContent";
import { QuizSidebarContent } from "@/components/sidebar/QuizSidebarContent";
import { QuizFilterModal } from "@/components/sidebar/QuizFilterModal";
import { SidebarLink } from "@/components/sidebar/SidebarPrimitives";
import { useSidebarQuizHistory } from "@/hooks/useSidebarQuizHistory";

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSearchOpen?: () => void;
  onDeleteRequest?: (id: string) => void;
  onRenameRequest?: (id: string, title: string) => void;
  onOpenReportProblem: () => void;
  onOpenSettings: () => void;
  isAdmin?: boolean;
}

const HELP_SUBMENU_HEIGHT = 196;

export default function AppSidebar({
  isOpen,
  onClose,
  onSearchOpen,
  onDeleteRequest,
  onRenameRequest,
  onOpenReportProblem,
  onOpenSettings,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [isHelpSubmenuOpen, setIsHelpSubmenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const helpRowRef = useRef<HTMLButtonElement | null>(null);
  const helpSubmenuRef = useRef<HTMLDivElement | null>(null);
  const hideHelpTimeoutRef = useRef<number | null>(null);
  const [desktopHelpMenuPosition, setDesktopHelpMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const {
    sessions,
    isLoadingHistory,
    activeSessionId,
    setActiveSessionId,
  } = useChatSession();

  const isOnMain = pathname === "/main";
  const isOnReader = pathname.startsWith("/reader");
  const isOnQuiz = pathname.startsWith("/quiz");
  const isIconOnly = !isOpen;

  const {
    applyFilters,
    clearFilters,
    draftFilters,
    hasActiveFilters,
    quizLoading,
    quizResults,
    setDraftFilters,
    setShowFilterModal,
    showFilterModal,
  } = useSidebarQuizHistory(isOnQuiz);

  useEffect(() => {
    if (!isOnQuiz && showFilterModal) {
      setShowFilterModal(false);
    }
  }, [isOnQuiz, setShowFilterModal, showFilterModal]);

  useEffect(() => {
    setIsSettingsMenuOpen(false);
    setIsHelpSubmenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (!settingsMenuRef.current?.contains(targetNode) && !helpSubmenuRef.current?.contains(targetNode)) {
        setIsSettingsMenuOpen(false);
        setIsHelpSubmenuOpen(false);
        setDesktopHelpMenuPosition(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    return () => {
      if (hideHelpTimeoutRef.current !== null) {
        window.clearTimeout(hideHelpTimeoutRef.current);
      }
    };
  }, []);

  const closeSettingsMenu = () => {
    setIsSettingsMenuOpen(false);
    setIsHelpSubmenuOpen(false);
    setDesktopHelpMenuPosition(null);
    if (hideHelpTimeoutRef.current !== null) {
      window.clearTimeout(hideHelpTimeoutRef.current);
      hideHelpTimeoutRef.current = null;
    }
  };

  const openHelpPage = (path: string) => {
    closeSettingsMenu();
    if (typeof window !== "undefined") {
      window.open(path, "_blank", "noopener,noreferrer");
    }
  };

  const clearHideHelpTimeout = () => {
    if (hideHelpTimeoutRef.current !== null) {
      window.clearTimeout(hideHelpTimeoutRef.current);
      hideHelpTimeoutRef.current = null;
    }
  };

  const scheduleHideHelpMenu = () => {
    clearHideHelpTimeout();
    hideHelpTimeoutRef.current = window.setTimeout(() => {
      setIsHelpSubmenuOpen(false);
      setDesktopHelpMenuPosition(null);
      hideHelpTimeoutRef.current = null;
    }, 150);
  };

  const openHelpMenu = () => {
    if (typeof window === "undefined" || !helpRowRef.current) {
      return;
    }

    clearHideHelpTimeout();
    const rect = helpRowRef.current.getBoundingClientRect();
    const isMobileViewport = window.innerWidth < 768;
    const menuWidth = isMobileViewport ? Math.min(288, window.innerWidth - 24) : 256;
    let top = isMobileViewport
      ? Math.max(12, rect.top - 8)
      : rect.top;
    const left = isMobileViewport
      ? Math.min(window.innerWidth - menuWidth - 12, Math.max(12, rect.left))
      : rect.right + 8;

    if (!isMobileViewport && top + HELP_SUBMENU_HEIGHT > window.innerHeight) {
      top = Math.max(12, rect.bottom - HELP_SUBMENU_HEIGHT);
    }

    setDesktopHelpMenuPosition({ top, left });
    setIsHelpSubmenuOpen(true);
  };

  const handleLoadSession = async (id: string) => {
    setActiveSessionId(id);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      onClose();
    }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    if (!isOnMain) {
      router.push("/main");
    }
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      onClose();
    }
  };

  return (
    <>
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-[80vw] max-w-sm transform transition-transform duration-300 bg-card border-r border-border
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:inset-auto md:z-auto md:max-w-none md:translate-x-0
          md:transition-[width,opacity] md:duration-300 md:ease-in-out md:flex-shrink-0 md:overflow-visible
          ${isOpen ? "md:w-72" : "md:w-[63px] md:translate-x-0"}
        `}
      >
        <div className="h-full flex flex-col bg-card overflow-visible">
          <div className={`flex items-center py-5 ${isIconOnly ? "justify-center px-2" : "justify-between pl-6 pr-3"}`}>
            {!isIconOnly && <Logo className="h-5 w-auto" />}
            <button
              onClick={onClose}
              title={isIconOnly ? "Expand sidebar" : "Collapse sidebar"}
              className="p-2 text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <PanelLeft size={20} />
            </button>
          </div>

          {isOnMain && (
            <MainSidebarContent
              activeSessionId={activeSessionId}
              handleLoadSession={handleLoadSession}
              handleNewChat={handleNewChat}
              isIconOnly={isIconOnly}
              isLoadingHistory={isLoadingHistory}
              onDeleteRequest={onDeleteRequest}
              onRenameRequest={onRenameRequest}
              onSearchOpen={onSearchOpen}
              openMenuId={openMenuId}
              routerPush={(path) => router.push(path)}
              sessions={sessions}
              setOpenMenuId={setOpenMenuId}
            />
          )}

          {isOnReader && (
            <StudySidebarContent
              isIconOnly={isIconOnly}
              pathname={pathname}
              routerPush={(path) => router.push(path)}
            />
          )}

          {isOnQuiz && (
            <QuizSidebarContent
              hasActiveFilters={hasActiveFilters}
              isIconOnly={isIconOnly}
              pathname={pathname}
              quizLoading={quizLoading}
              quizResults={quizResults}
              routerPush={(path) => router.push(path)}
              showFilters={() => setShowFilterModal(true)}
            />
          )}

          <div
            ref={settingsMenuRef}
            className={`relative mt-auto border-t border-border py-3 ${isIconOnly ? "flex flex-col items-center" : "px-2"}`}
          >
            <SidebarLink
              icon={Settings}
              label="Settings & Help"
              onClick={() => setIsSettingsMenuOpen((previous) => !previous)}
              isIconOnly={isIconOnly}
              active={isSettingsMenuOpen}
            />

            {isSettingsMenuOpen && (
              <div
                className={`absolute bottom-full z-[70] mb-2 rounded-xl border border-border bg-card shadow-xl ${
                  isIconOnly ? "left-3 w-72" : "left-2 right-2"
                }`}
              >
                <div className="p-2">
                  <button
                    onClick={() => {
                      closeSettingsMenu();
                      onOpenSettings();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-muted"
                  >
                    <Settings className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Settings</span>
                  </button>

                  <div
                    className="relative"
                    onPointerEnter={openHelpMenu}
                    onPointerLeave={scheduleHideHelpMenu}
                  >
                    <button
                      ref={helpRowRef}
                      onPointerEnter={openHelpMenu}
                      onClick={() => {
                        if (typeof window !== "undefined" && window.innerWidth < 768) {
                          if (isHelpSubmenuOpen) {
                            scheduleHideHelpMenu();
                          } else {
                            openHelpMenu();
                          }
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-muted"
                    >
                      <CircleHelp className="h-4 w-4 shrink-0" />
                      <span className="flex-1">Help</span>
                      <ChevronRight
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          isHelpSubmenuOpen ? "rotate-90 md:rotate-0" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <QuizFilterModal
        applyFilters={applyFilters}
        clearFilters={clearFilters}
        draftFilters={draftFilters}
        isOpen={showFilterModal}
        setDraftFilters={setDraftFilters}
        onClose={() => setShowFilterModal(false)}
      />
      {isHelpSubmenuOpen && desktopHelpMenuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={helpSubmenuRef}
              className="fixed z-[200] w-64 space-y-1 rounded-xl border border-border bg-card p-2 shadow-xl"
              style={{
                top: window.innerWidth < 768 ? undefined : desktopHelpMenuPosition.top,
                left: desktopHelpMenuPosition.left,
                bottom: window.innerWidth < 768 ? window.innerHeight - desktopHelpMenuPosition.top + 8 : undefined,
              }}
              onPointerEnter={clearHideHelpTimeout}
              onPointerLeave={scheduleHideHelpMenu}
            >
              <button
                onClick={() => {
                  closeSettingsMenu();
                  onOpenReportProblem();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
              >
                <Bug className="h-4 w-4 shrink-0" />
                <span>Report a Bug</span>
              </button>
              <button
                onClick={() => openHelpPage("/terms")}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span>Terms & Policies</span>
              </button>
              <button
                onClick={() => openHelpPage("/faq")}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
              >
                <CircleHelp className="h-4 w-4 shrink-0" />
                <span>FAQ</span>
              </button>
              <button
                onClick={() => openHelpPage("/contact")}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
              >
                <Mail className="h-4 w-4 shrink-0" />
                <span>Contact Us</span>
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
