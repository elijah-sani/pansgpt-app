"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Bug, CalendarDays, ChevronDown, ChevronRight, CircleHelp, ExternalLink, FileText, Mail, MoreVertical, PanelLeft, Pencil, Search, Settings, NotepadText, MessageSquare, BookOpen, Brain, Trash2, X, SquarePen } from "lucide-react";
import Logo from "@/components/Logo";
import { useChatSession } from "@/lib/ChatSessionContext";
import { MainSidebarContent } from "@/components/sidebar/MainSidebarContent";
import { StudySidebarContent } from "@/components/sidebar/StudySidebarContent";
import { QuizSidebarContent } from "@/components/sidebar/QuizSidebarContent";
import { SidebarConversationList } from "@/components/sidebar/SidebarConversationList";
import { SidebarLink } from "@/components/sidebar/SidebarPrimitives";
import { SidebarNotesSection, type SidebarNoteItem } from "@/components/sidebar/SidebarNotesSection";
import { api } from "@/lib/api";
import { buildWhatsAppSupportUrl } from "@/lib/support-config";

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
const SIDEBAR_NOTES_LIMIT = 2;
const LEGACY_QUICK_NOTE_TAG_PREFIX = "quick:v1";
const CONTACT_SUPPORT_MESSAGE = "Hi PansGPT Support, I need help with my account or app.";

type SidebarChatSession = {
  id: string;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
};

function isLegacyQuickNote(note: { tags?: string[] | null }) {
  return Array.isArray(note.tags) && note.tags.some((tag) => typeof tag === "string" && tag.startsWith(LEGACY_QUICK_NOTE_TAG_PREFIX));
}

function getChatDateGroup(timestamp?: string | null) {
  if (!timestamp) {
    return "Older";
  }

  const created = new Date(timestamp);
  if (Number.isNaN(created.getTime())) {
    return "Older";
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfCreated = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime();
  const dayDiff = Math.floor((startOfToday - startOfCreated) / 86400000);

  if (dayDiff <= 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff <= 7) return "Previous 7 days";
  if (dayDiff <= 30) return "Previous 30 days";
  return created.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function groupChatSessionsByDate(sessions: SidebarChatSession[]) {
  const groups: Array<{ label: string; sessions: SidebarChatSession[] }> = [];
  const groupMap = new Map<string, SidebarChatSession[]>();

  sessions.forEach((session) => {
    const label = getChatDateGroup(session.updated_at || session.created_at);
    const group = groupMap.get(label) || [];
    group.push(session);
    if (!groupMap.has(label)) {
      groupMap.set(label, group);
      groups.push({ label, sessions: group });
    }
  });

  return groups;
}

type SidebarChatHistorySectionProps = {
  activeSessionId: string | null;
  handleLoadSession: (id: string) => void;
  isLoadingHistory: boolean;
  onDeleteRequest?: (id: string) => void;
  onRenameRequest?: (id: string, title: string) => void;
  openMenuId: string | null;
  sessions: SidebarChatSession[];
  setOpenMenuId: (id: string | null) => void;
};

function SidebarChatHistorySection({
  activeSessionId,
  handleLoadSession,
  isLoadingHistory,
  onDeleteRequest,
  onRenameRequest,
  openMenuId,
  sessions,
  setOpenMenuId,
}: SidebarChatHistorySectionProps) {
  const [isDateGroupingEnabled, setIsDateGroupingEnabled] = useState(false);
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(true);

  return (
    <>
      <div className="flex flex-col flex-1 overflow-hidden pt-2 pb-2">
        <div className="flex min-h-8 items-center justify-between px-5 pt-2 pb-3 shrink-0">
          <div className="flex items-center">
            <span className="text-xs font-medium text-muted-foreground">Recent chats</span>
            <button
              type="button"
              onClick={() => setIsChatHistoryOpen((previous) => !previous)}
              aria-expanded={isChatHistoryOpen}
              title={isChatHistoryOpen ? "Collapse recent chats" : "Expand recent chats"}
              className="ml-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <ChevronDown
                size={16}
                className={`transition-transform ${isChatHistoryOpen ? "rotate-0" : "-rotate-90"}`}
              />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsDateGroupingEnabled((previous) => !previous)}
              aria-pressed={isDateGroupingEnabled}
              title={isDateGroupingEnabled ? "Disable date grouping" : "Enable date grouping"}
              className={`rounded-md p-1.5 transition-colors ${
                isDateGroupingEnabled ? "bg-muted text-foreground" : "text-foreground hover:bg-muted"
              }`}
            >
              <CalendarDays size={14} />
            </button>
          </div>
        </div>
        {isChatHistoryOpen ? (
          <div className="flex-1 overflow-y-auto px-3 pb-2">
            <SidebarConversationList
              activeSessionId={activeSessionId}
              emptyText="No chats yet"
              handleLoadSession={handleLoadSession}
              isDateGroupingEnabled={isDateGroupingEnabled}
              isLoadingHistory={isLoadingHistory}
              loadingText="Loading..."
              onDeleteRequest={onDeleteRequest}
              onRenameRequest={onRenameRequest}
              openMenuId={openMenuId}
              sessions={sessions}
              setOpenMenuId={setOpenMenuId}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

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
  const [isDateGroupingEnabled, setIsDateGroupingEnabled] = useState(false);
  const [isMobileChatHistoryOpen, setIsMobileChatHistoryOpen] = useState(true);
  const [sidebarNotes, setSidebarNotes] = useState<SidebarNoteItem[]>([]);
  const [sidebarNotesCount, setSidebarNotesCount] = useState(0);
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
    hasLoadedHistory,
    fetchHistory,
    activeSessionId,
    setActiveSessionId,
    setPendingPath,
  } = useChatSession();

  const isOnMain = pathname === "/main";
  const isOnReader = pathname.startsWith("/reader");
  const isOnQuiz = pathname.startsWith("/quiz");
  const isOnNotes = pathname.startsWith("/notes");
  const showChatHistory = isOnMain || isOnReader || isOnQuiz || isOnNotes;
  const isIconOnly = !isOpen;

  useEffect(() => {
    if (isIconOnly || !(isOnMain || isOnReader || isOnQuiz || isOnNotes)) return;

    let isCancelled = false;
    const loadSidebarNotes = async () => {
      try {
        const response = await api.get("/notes");
        if (!response.ok) return;

        const payload = (await response.json()) as {
          notes?: Array<{
            id: string | number;
            title?: string | null;
            created_at?: string;
            last_edited_at?: string | null;
            tags?: string[] | null;
          }>;
        };
        const regularNotes = (Array.isArray(payload.notes) ? payload.notes : []).filter((note) => !isLegacyQuickNote(note));
        const recentNotes = regularNotes
          .map((note, index) => {
            const normalizedTitle = typeof note.title === "string" ? note.title.trim() : "";
            return {
              id: String(note.id),
              title: normalizedTitle || `Untitled note ${index + 1}`,
              timestamp: new Date(note.last_edited_at || note.created_at || 0).getTime(),
            };
          })
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, SIDEBAR_NOTES_LIMIT)
          .map(({ id, title }) => ({ id, title }));

        if (!isCancelled) {
          setSidebarNotesCount(regularNotes.length);
          setSidebarNotes(recentNotes);
        }
      } catch {
        if (!isCancelled) {
          setSidebarNotesCount(0);
          setSidebarNotes([]);
        }
      }
    };

    void loadSidebarNotes();

    const refreshSidebarNotes = () => {
      void loadSidebarNotes();
    };

    window.addEventListener("focus", refreshSidebarNotes);
    window.addEventListener("storage", refreshSidebarNotes);
    window.addEventListener("pansgpt-notes-updated", refreshSidebarNotes);

    return () => {
      isCancelled = true;
      window.removeEventListener("focus", refreshSidebarNotes);
      window.removeEventListener("storage", refreshSidebarNotes);
      window.removeEventListener("pansgpt-notes-updated", refreshSidebarNotes);
    };
  }, [isIconOnly, isOnMain, isOnNotes, isOnQuiz, isOnReader]);

  useEffect(() => {
    if (!showChatHistory || hasLoadedHistory) return;
    void fetchHistory();
  }, [fetchHistory, hasLoadedHistory, showChatHistory]);

  useEffect(() => {
    setIsSettingsMenuOpen(false);
    setIsHelpSubmenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      // Don't close if the click originated from the help button itself
      const targetNode = event.target as Node;
      if (
        helpRowRef.current?.contains(targetNode) ||
        helpSubmenuRef.current?.contains(targetNode)
      ) {
        return;
      }
      if (!settingsMenuRef.current?.contains(targetNode)) {
        setIsSettingsMenuOpen(false);
      }
      if (!helpSubmenuRef.current?.contains(targetNode)) {
        setIsHelpSubmenuOpen(false);
        setDesktopHelpMenuPosition(null);
      }
      if (
        openMenuId &&
        targetNode instanceof Element &&
        !targetNode.closest("[data-mobile-chat-menu]")
      ) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [openMenuId]);

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

  const openWhatsAppSupport = () => {
    closeSettingsMenu();
    if (typeof window !== "undefined") {
      window.open(buildWhatsAppSupportUrl(CONTACT_SUPPORT_MESSAGE), "_blank", "noopener,noreferrer");
    }
  };

  const clearHideHelpTimeout = () => {
    if (hideHelpTimeoutRef.current !== null) {
      window.clearTimeout(hideHelpTimeoutRef.current);
      hideHelpTimeoutRef.current = null;
    }
  };

  const isMobileViewport = () => typeof window !== "undefined" && window.innerWidth < 768;

  const scheduleHideHelpMenu = () => {
    if (isMobileViewport()) {
      return;
    }
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
    const mobileViewport = window.innerWidth < 768;
    const menuWidth = mobileViewport ? Math.min(288, window.innerWidth - 24) : 256;
    let top = mobileViewport
      ? Math.max(12, rect.top - 8)
      : rect.top;
    const left = mobileViewport
      ? Math.min(window.innerWidth - menuWidth - 12, Math.max(12, rect.left))
      : rect.right + 8;

    if (!mobileViewport && top + HELP_SUBMENU_HEIGHT > window.innerHeight) {
      top = Math.max(12, rect.bottom - HELP_SUBMENU_HEIGHT);
    }

    setDesktopHelpMenuPosition({ top, left });
    setIsHelpSubmenuOpen(true);
  };

  const handleNavigate = (path: string) => {
    if (path !== pathname) {
      setPendingPath(path);
    }
    router.push(path);
  };

  const handleLoadSession = async (id: string) => {
    setActiveSessionId(id);
    if (!isOnMain) {
      setPendingPath("/main");
      router.push("/main");
    }
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      onClose();
    }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    if (!isOnMain) {
      setPendingPath("/main");
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
          fixed inset-y-0 left-0 z-[140] flex w-screen transform flex-col bg-background text-foreground transition-transform duration-300 md:hidden
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-5 pb-4 pt-6">
            <button
              type="button"
              onClick={() => {
                handleNavigate("/main");
                onClose();
              }}
              className="rounded-[10px] transition-transform active:scale-[0.98]"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <Logo className="h-6 w-auto" />
            </button>

            <div className="flex items-center gap-3">
              {onSearchOpen && showChatHistory && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchOpen();
                    onClose();
                  }}
                  aria-label="Search chats"
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] text-foreground transition-all active:scale-95 active:bg-muted"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <Search className="h-[18px] w-[18px]" strokeWidth={2.4} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sidebar"
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-foreground transition-all active:scale-95 active:bg-muted"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <X className="h-[18px] w-[18px]" strokeWidth={2.4} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-32">
            <nav className="space-y-0.5 pt-3">
              <button
                type="button"
                onClick={() => {
                  handleNavigate("/reader");
                  onClose();
                }}
                className={`flex min-h-[40px] w-full items-center gap-3 rounded-[10px] px-1 text-left text-[15px] font-semibold transition-all active:scale-[0.98] active:bg-muted ${
                  isOnReader ? "text-primary" : "text-foreground"
                }`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <BookOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={2.2} />
                <span>Study</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleNavigate("/quiz");
                  onClose();
                }}
                className={`flex min-h-[40px] w-full items-center gap-3 rounded-[10px] px-1 text-left text-[15px] font-semibold transition-all active:scale-[0.98] active:bg-muted ${
                  isOnQuiz ? "text-primary" : "text-foreground"
                }`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <Brain className="h-[18px] w-[18px] shrink-0" strokeWidth={2.2} />
                <span>Quiz</span>
              </button>
            </nav>

            {/* COMMENTED OUT: Notes Feature
            <div>
              <SidebarNotesSection
                isIconOnly={false}
                compact
                notes={sidebarNotes}
                totalNotes={sidebarNotesCount}
                routerPush={(path) => {
                  router.push(path);
                  onClose();
                }}
              />
            </div>
            */}

            {showChatHistory && (
              <section className="pt-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center">
                    <span className="text-xs font-medium text-muted-foreground">Recent chats</span>
                    <button
                      type="button"
                      onClick={() => setIsMobileChatHistoryOpen((previous) => !previous)}
                      aria-expanded={isMobileChatHistoryOpen}
                      title={isMobileChatHistoryOpen ? "Collapse recent chats" : "Expand recent chats"}
                      className="ml-1 rounded-md p-1 text-muted-foreground transition-colors active:bg-muted"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isMobileChatHistoryOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDateGroupingEnabled((previous) => !previous)}
                    aria-pressed={isDateGroupingEnabled}
                    aria-label={isDateGroupingEnabled ? "Disable date grouping" : "Enable date grouping"}
                    className={`flex h-8 w-8 items-center justify-center rounded-[10px] transition-all active:scale-95 active:bg-muted ${
                      isDateGroupingEnabled ? "bg-muted text-foreground" : "text-muted-foreground"
                    }`}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <CalendarDays className="h-4 w-4" />
                  </button>
                </div>
                {isMobileChatHistoryOpen ? (
                  <div className="mt-2 space-y-0">
                    <SidebarConversationList
                      activeSessionId={activeSessionId}
                      handleLoadSession={handleLoadSession}
                      isDateGroupingEnabled={isDateGroupingEnabled}
                      isLoadingHistory={isLoadingHistory}
                      onDeleteRequest={onDeleteRequest}
                      onRenameRequest={onRenameRequest}
                      openMenuId={openMenuId}
                      sessions={sessions}
                      setOpenMenuId={setOpenMenuId}
                    />
                  </div>
                ) : null}
              </section>
            )}

          </div>

          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[160] h-28 bg-gradient-to-t from-background via-background/90 to-transparent">
            <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-5 pb-5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                aria-label="Settings and help"
                className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-border/70 bg-card/80 text-foreground shadow-lg backdrop-blur-md transition-all active:scale-95 active:bg-muted"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <Settings className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </button>
              <div className="flex flex-1 justify-end">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary px-5 text-[15px] font-bold text-primary-foreground shadow-2xl backdrop-blur-md transition-all active:scale-[0.98] active:bg-primary/90"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <SquarePen className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  <span>Chat</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <aside
        className={`
          fixed inset-y-0 left-0 z-[100] hidden w-[80vw] max-w-sm transform transition-transform duration-300 bg-card
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:inset-auto md:z-[100] md:block md:max-w-none md:translate-x-0
          md:transition-[width,opacity] md:duration-300 md:ease-in-out md:flex-shrink-0 md:overflow-visible
          ${isOpen ? "md:w-72" : "md:w-[63px] md:translate-x-0"}
        `}
      >
        <div className="h-full flex flex-col bg-card overflow-visible">
          <div className={`flex items-center py-5 ${isIconOnly ? "justify-center px-2" : "justify-between pl-6 pr-3"}`}>
            {!isIconOnly && <Logo className="h-5 w-auto" />}
            <div className="flex items-center gap-1">
              {!isIconOnly && onSearchOpen && showChatHistory ? (
                <button
                  type="button"
                  onClick={onSearchOpen}
                  title="Search chats"
                  aria-label="Search chats"
                  className="p-2 text-foreground hover:bg-accent active:bg-accent/80 active:scale-95 rounded-lg transition-colors"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <Search size={18} />
                </button>
              ) : null}
              <button
                onClick={onClose}
                title={isIconOnly ? "Expand sidebar" : "Collapse sidebar"}
                className="p-2 text-foreground hover:bg-accent active:bg-accent/80 active:scale-95 rounded-lg transition-colors"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <PanelLeft size={20} />
              </button>
            </div>
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
              openMenuId={openMenuId}
              notes={sidebarNotes}
              routerPush={handleNavigate}
              sessions={sessions}
              setOpenMenuId={setOpenMenuId}
              totalNotes={sidebarNotesCount}
            />
          )}

          {isOnReader && (
            <StudySidebarContent
              isIconOnly={isIconOnly}
              notes={sidebarNotes}
              pathname={pathname}
              routerPush={handleNavigate}
              totalNotes={sidebarNotesCount}
            />
          )}

          {isOnQuiz && (
            <QuizSidebarContent
              isIconOnly={isIconOnly}
              notes={sidebarNotes}
              pathname={pathname}
              routerPush={handleNavigate}
              totalNotes={sidebarNotesCount}
            />
          )}

          {isOnNotes && (
            <nav className={isIconOnly ? 'flex flex-col items-center py-1 gap-0.5' : 'px-2 space-y-0.5'}>
              <SidebarLink icon={MessageSquare} label="Chat" onClick={() => handleNavigate('/main')} isIconOnly={isIconOnly} />
              <SidebarLink icon={BookOpen} label="Study" onClick={() => handleNavigate('/reader')} isIconOnly={isIconOnly} />
              <SidebarLink icon={Brain} label="Quiz" onClick={() => handleNavigate('/quiz')} isIconOnly={isIconOnly} />
              {/* COMMENTED OUT: Notes Feature
              <SidebarLink icon={NotepadText} label="Notes" onClick={() => handleNavigate('/notes')} isIconOnly={isIconOnly} active />
              */}
            </nav>
          )}

          {(isOnReader || isOnQuiz || isOnNotes) && !isIconOnly && (
            <SidebarChatHistorySection
              activeSessionId={activeSessionId}
              handleLoadSession={handleLoadSession}
              isLoadingHistory={isLoadingHistory}
              onDeleteRequest={onDeleteRequest}
              onRenameRequest={onRenameRequest}
              openMenuId={openMenuId}
              sessions={sessions}
              setOpenMenuId={setOpenMenuId}
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
                className={`absolute bottom-full z-[70] mb-2 rounded-xl border border-border bg-card shadow-sm ${
                  isIconOnly ? "left-3 w-72" : "left-2 right-2"
                }`}
              >
                <div className="p-2">
                  <button
                    onClick={() => {
                      closeSettingsMenu();
                      onOpenSettings();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-muted active:bg-muted/80"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <Settings className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Settings</span>
                  </button>

                  <div
                    className="relative"
                    onPointerEnter={() => {
                      if (!isMobileViewport()) {
                        openHelpMenu();
                      }
                    }}
                    onPointerLeave={() => {
                      if (!isMobileViewport()) {
                        scheduleHideHelpMenu();
                      }
                    }}
                  >
                    <button
                      ref={helpRowRef}
                      onPointerEnter={() => {
                        if (!isMobileViewport()) {
                          openHelpMenu();
                        }
                      }}
                      onClick={() => {
                        if (isHelpSubmenuOpen) {
                          setIsHelpSubmenuOpen(false);
                          setDesktopHelpMenuPosition(null);
                        } else {
                          openHelpMenu();
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-muted active:bg-muted/80"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
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

      {isHelpSubmenuOpen && desktopHelpMenuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={helpSubmenuRef}
              className="fixed z-[200] w-64 space-y-1 rounded-xl border border-border bg-card p-2 shadow-sm"
              style={{
                top: window.innerWidth < 768 ? undefined : desktopHelpMenuPosition.top,
                left: desktopHelpMenuPosition.left,
                bottom: window.innerWidth < 768 ? window.innerHeight - desktopHelpMenuPosition.top + 8 : undefined,
              }}
              onPointerEnter={() => {
                if (!isMobileViewport()) {
                  clearHideHelpTimeout();
                }
              }}
              onPointerLeave={() => {
                if (!isMobileViewport()) {
                  scheduleHideHelpMenu();
                }
              }}
            >
              <button
                onClick={() => {
                  closeSettingsMenu();
                  onOpenReportProblem();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted active:bg-muted/80"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Bug className="h-4 w-4 shrink-0" />
                <span>Report a Bug</span>
              </button>
              <button
                onClick={() => openHelpPage("/terms")}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted active:bg-muted/80"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="flex-1">Terms & Policies</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
              <button
                onClick={() => openHelpPage("/faq")}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted active:bg-muted/80"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <CircleHelp className="h-4 w-4 shrink-0" />
                <span className="flex-1">FAQ</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
              <button
                onClick={openWhatsAppSupport}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted active:bg-muted/80"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Mail className="h-4 w-4 shrink-0" />
                <span className="flex-1">Contact Us</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </div>,
            document.body
          )
        : null}

    </>
  );
}
