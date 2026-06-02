"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { Bug, CalendarDays, ChevronDown, ChevronRight, CircleHelp, FileText, Mail, MoreVertical, PanelLeft, Pencil, Search, Settings, SlidersHorizontal, NotepadText, MessageSquare, BookOpen, Brain, Trash2, X, Loader2, SquarePen } from "lucide-react";
import Logo from "@/components/Logo";
import { useChatSession } from "@/lib/ChatSessionContext";
import { MainSidebarContent } from "@/components/sidebar/MainSidebarContent";
import { StudySidebarContent } from "@/components/sidebar/StudySidebarContent";
import { QuizSidebarContent } from "@/components/sidebar/QuizSidebarContent";
import { QuizFilterModal } from "@/components/sidebar/QuizFilterModal";
import { SidebarConversationList } from "@/components/sidebar/SidebarConversationList";
import { SidebarLink } from "@/components/sidebar/SidebarPrimitives";
import { useSidebarQuizHistory } from "@/hooks/useSidebarQuizHistory";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { BlockNoteContent } from "@/types/types";

const RichNoteEditor = dynamic(() => import("@/components/notes/RichNoteEditor"), { ssr: false });

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
const NOTES_SWITCH_THRESHOLD = 3;
const QUICK_NOTES_LIMIT = 2;
const QUICK_NOTE_TAG_PREFIX = "quick:v1";
const QUICK_NOTE_TITLE = "Quick notes";
const QUICK_NOTE_STORAGE_KEY = "pansgpt_quick_note_persistent";

type SidebarNoteItem = {
  id: string;
  title: string;
};

type SidebarChatSession = {
  id: string;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
};

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
  onSearchOpen?: () => void;
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
  onSearchOpen,
  openMenuId,
  sessions,
  setOpenMenuId,
}: SidebarChatHistorySectionProps) {
  const [isDateGroupingEnabled, setIsDateGroupingEnabled] = useState(false);

  return (
    <>
      <div className="px-5 pt-4"><div className="border-t border-border" /></div>
      <div className="flex flex-col flex-1 overflow-hidden pt-2 pb-2">
        <div className="flex items-center justify-between px-6 pt-2 pb-3 shrink-0">
          <h4 className="text-xs font-bold text-foreground/70 tracking-wider uppercase">Chat history</h4>
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
            {onSearchOpen && (
              <button onClick={onSearchOpen} className="p-1.5 text-foreground hover:bg-muted rounded-md transition-colors">
                <Search size={14} />
              </button>
            )}
          </div>
        </div>
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
      </div>
    </>
  );
}

function isQuickNote(note: { tags?: string[] | null }) {
  return Array.isArray(note.tags) && note.tags.some((tag) => typeof tag === "string" && tag.startsWith(QUICK_NOTE_TAG_PREFIX));
}

function hasMeaningfulContent(content?: BlockNoteContent) {
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (!block || typeof block !== "object") return false;
    const entry = block as Record<string, unknown>;
    if (entry.type === "image") return true;
    if (!Array.isArray(entry.content)) return false;
    return entry.content.some((item) => {
      if (!item || typeof item !== "object") return false;
      const text = (item as Record<string, unknown>).text;
      return typeof text === "string" && text.trim().length > 0;
    });
  });
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
  const [isMobileQuizHistoryOpen, setIsMobileQuizHistoryOpen] = useState(true);
  const [notesList, setNotesList] = useState<SidebarNoteItem[]>([]);
  const [notesCount, setNotesCount] = useState(0);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [isHelpSubmenuOpen, setIsHelpSubmenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const helpRowRef = useRef<HTMLButtonElement | null>(null);
  const helpSubmenuRef = useRef<HTMLDivElement | null>(null);
  const hideHelpTimeoutRef = useRef<number | null>(null);
  const [desktopHelpMenuPosition, setDesktopHelpMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [isQuickNoteModalOpen, setIsQuickNoteModalOpen] = useState(false);
  const [quickNoteContent, setQuickNoteContent] = useState<BlockNoteContent>([]);
  const [quickNoteId, setQuickNoteId] = useState<string | null>(null);
  const [quickNoteEditorRevision, setQuickNoteEditorRevision] = useState(0);
  const [isSavingQuickNote, setIsSavingQuickNote] = useState(false);
  const [isQuickNoteHydrating, setIsQuickNoteHydrating] = useState(false);
  const [isQuickNoteReady, setIsQuickNoteReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const quickNoteSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    sessions,
    isLoadingHistory,
    activeSessionId,
    setActiveSessionId,
  } = useChatSession();

  const isOnMain = pathname === "/main";
  const isOnReader = pathname.startsWith("/reader");
  const isOnQuiz = pathname.startsWith("/quiz");
  const isOnNotes = pathname.startsWith("/notes");
  const showChatHistory = isOnMain || isOnReader || isOnQuiz || isOnNotes;
  const isIconOnly = !isOpen;
  const useCompactNotesList = notesCount > NOTES_SWITCH_THRESHOLD;
  const quickNotes = useCompactNotesList ? notesList.slice(0, QUICK_NOTES_LIMIT) : [];
  const quickNoteStorageKey = QUICK_NOTE_STORAGE_KEY;

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
    if (!(isOnMain || isOnQuiz) || isIconOnly) return;

    let isCancelled = false;
    const loadNotes = async () => {
      try {
        const response = await api.get("/notes");
        if (!response.ok) return;

        const payload = (await response.json()) as { notes?: Array<{ id: string | number; title?: string | null; created_at?: string; last_edited_at?: string | null; tags?: string[] | null }> };
        const raw = Array.isArray(payload.notes) ? payload.notes : [];
        const regularNotes = raw.filter((note) => !isQuickNote(note));
        if (!isCancelled) {
          setNotesCount(regularNotes.length);
        }
        const mapped = regularNotes
          .map((note, index) => {
            const id = String(note.id);
            const normalizedTitle = typeof note.title === "string" ? note.title.trim() : "";
            return {
              id,
              title: normalizedTitle || `Untitled note ${index + 1}`,
              timestamp: new Date(note.last_edited_at || note.created_at || 0).getTime(),
            };
          })
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, QUICK_NOTES_LIMIT)
          .map(({ id, title }) => ({ id, title }));

        if (!isCancelled) {
          setNotesList(mapped);
        }
      } catch {
        if (!isCancelled) {
          setNotesCount(0);
          setNotesList([]);
        }
      }
    };

    void loadNotes();

    const handleRefresh = () => {
      void loadNotes();
    };

    const handleFocus = () => {
      void loadNotes();
    };

    const handleNotesUpdated = () => {
      void loadNotes();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleRefresh);
    window.addEventListener("pansgpt-notes-updated", handleNotesUpdated);

    return () => {
      isCancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleRefresh);
      window.removeEventListener("pansgpt-notes-updated", handleNotesUpdated);
    };
  }, [isIconOnly, isOnMain, isOnQuiz]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isQuickNoteModalOpen || isQuickNoteReady) return;
    let isCancelled = false;
    setIsQuickNoteHydrating(true);

    const hydrateQuickNote = async () => {
      let cached: { noteId: string | null; content: BlockNoteContent } = {
        noteId: null,
        content: [],
      };

      try {
        const raw = localStorage.getItem(quickNoteStorageKey);
        if (raw) {
          const saved = JSON.parse(raw) as {
            noteId?: string | null;
            content?: BlockNoteContent;
          };
          cached = {
            noteId: saved.noteId ? String(saved.noteId) : null,
            content: Array.isArray(saved.content) ? saved.content : [],
          };
        }
      } catch {
        cached = { noteId: null, content: [] };
      }

      try {
        const response = await api.get("/notes");
        if (response.ok) {
          const payload = (await response.json()) as {
            notes?: Array<{
              id: string | number;
              content?: BlockNoteContent;
              created_at?: string;
              last_edited_at?: string | null;
              tags?: string[] | null;
            }>;
          };
          const quickCandidates = (Array.isArray(payload.notes) ? payload.notes : []).filter(isQuickNote);
          const sharedQuickNote =
            (cached.noteId ? quickCandidates.find((note) => String(note.id) === cached.noteId) : null) ||
            quickCandidates.sort((a, b) => {
              const aTime = new Date(a.last_edited_at || a.created_at || 0).getTime();
              const bTime = new Date(b.last_edited_at || b.created_at || 0).getTime();
              return bTime - aTime;
            })[0];

          if (sharedQuickNote) {
            const content = Array.isArray(sharedQuickNote.content) ? sharedQuickNote.content : [];
            if (!isCancelled) {
              setQuickNoteId(String(sharedQuickNote.id));
              setQuickNoteContent(content);
              setQuickNoteEditorRevision((revision) => revision + 1);
              localStorage.setItem(quickNoteStorageKey, JSON.stringify({
                noteId: String(sharedQuickNote.id),
                content,
              }));
            }
            return;
          }
        }
      } catch {
        // Fall back to the local cache below.
      }

      if (!isCancelled) {
        setQuickNoteId(cached.noteId);
        setQuickNoteContent(cached.content);
        setQuickNoteEditorRevision((revision) => revision + 1);
      }
    };

    void hydrateQuickNote().finally(() => {
      if (!isCancelled) {
        setIsQuickNoteHydrating(false);
        setIsQuickNoteReady(true);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isQuickNoteModalOpen, isQuickNoteReady, quickNoteStorageKey]);

  useEffect(() => {
    if (!isQuickNoteModalOpen || !isQuickNoteReady || isQuickNoteHydrating) return;
    try {
      localStorage.setItem(
        quickNoteStorageKey,
        JSON.stringify({
          noteId: quickNoteId,
          content: quickNoteContent,
        }),
      );
    } catch {
      // ignore
    }
  }, [isQuickNoteModalOpen, isQuickNoteReady, isQuickNoteHydrating, quickNoteStorageKey, quickNoteId, quickNoteContent]);

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

  const handleLoadSession = async (id: string) => {
    setActiveSessionId(id);
    if (!isOnMain) {
      router.push("/main");
    }
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

  const openQuickNoteModal = () => {
    setIsQuickNoteReady(false);
    setIsQuickNoteModalOpen(true);
  };

  const closeQuickNoteModal = () => {
    if (quickNoteSaveTimerRef.current) {
      clearTimeout(quickNoteSaveTimerRef.current);
      quickNoteSaveTimerRef.current = null;
      void autosaveQuickNote();
    }
    setIsQuickNoteModalOpen(false);
  };

  const hasMeaningfulQuickNoteContent = () => {
    return hasMeaningfulContent(quickNoteContent);
  };

  const autosaveQuickNote = async () => {
    if (!isQuickNoteModalOpen || !isQuickNoteReady || isQuickNoteHydrating || isSavingQuickNote) return;
    if (!hasMeaningfulQuickNoteContent()) return;

    setIsSavingQuickNote(true);
    try {
      let savedQuickNoteId = quickNoteId;
      if (quickNoteId) {
        const response = await api.patch(`/notes/${quickNoteId}`, {
          title: QUICK_NOTE_TITLE,
          content: quickNoteContent,
          tags: [QUICK_NOTE_TAG_PREFIX],
        });
        if (!response.ok) {
          throw new Error(`Quick note update failed: ${response.status}`);
        }
      } else {
        const response = await api.post("/notes", {
          title: QUICK_NOTE_TITLE,
          content: quickNoteContent,
          user_annotation: null,
          document_id: null,
          tags: [QUICK_NOTE_TAG_PREFIX],
        });
        if (!response.ok) {
          throw new Error(`Quick note save failed: ${response.status}`);
        }
        const saved = (await response.json()) as { id: string | number };
        savedQuickNoteId = String(saved.id);
        setQuickNoteId(savedQuickNoteId);
      }

      localStorage.setItem(
        quickNoteStorageKey,
        JSON.stringify({
          noteId: savedQuickNoteId,
          content: quickNoteContent,
        }),
      );
      window.dispatchEvent(new Event("pansgpt-notes-updated"));
    } catch (error) {
      console.error(error);
      toast.error("Unable to autosave quick note");
    } finally {
      setIsSavingQuickNote(false);
    }
  };

  useEffect(() => {
    if (!isQuickNoteModalOpen || !isQuickNoteReady || isQuickNoteHydrating) return;
    if (quickNoteSaveTimerRef.current) {
      clearTimeout(quickNoteSaveTimerRef.current);
    }
    quickNoteSaveTimerRef.current = setTimeout(() => {
      void autosaveQuickNote();
    }, 1200);
    return () => {
      if (quickNoteSaveTimerRef.current) {
        clearTimeout(quickNoteSaveTimerRef.current);
      }
    };
  }, [isQuickNoteModalOpen, isQuickNoteReady, isQuickNoteHydrating, quickNoteContent]);

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
                router.push("/main");
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
                  router.push("/reader");
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
                  router.push("/quiz");
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
              <button
                type="button"
                onClick={() => {
                  router.push("/notes");
                  onClose();
                }}
                className={`flex min-h-[40px] w-full items-center gap-3 rounded-[10px] px-1 text-left text-[15px] font-semibold transition-all active:scale-[0.98] active:bg-muted ${
                  isOnNotes ? "text-primary" : "text-foreground"
                }`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <NotepadText className="h-[18px] w-[18px] shrink-0" strokeWidth={2.2} />
                <span>Notes</span>
              </button>
            </nav>

            {isOnQuiz && (
              <section className="pt-6">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setIsMobileQuizHistoryOpen((previous) => !previous)}
                    aria-expanded={isMobileQuizHistoryOpen}
                    className="flex min-h-8 flex-1 items-center gap-2 text-left transition-colors active:text-foreground"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        isMobileQuizHistoryOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                    <h2 className="text-[15px] font-semibold text-foreground">Quiz history</h2>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilterModal(true)}
                    title="Filter quiz history"
                    aria-label="Filter quiz history"
                    className={`relative flex h-8 w-8 items-center justify-center rounded-[10px] transition-all active:scale-95 active:bg-muted ${
                      hasActiveFilters ? "bg-primary/10 text-primary" : "text-muted-foreground"
                    }`}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    {hasActiveFilters && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />}
                  </button>
                </div>
                {isMobileQuizHistoryOpen && (
                  <div className="mt-3 space-y-1">
                    {quizLoading ? (
                      <div className="flex min-h-[38px] items-center gap-3 rounded-[10px] text-sm font-medium text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Loading quizzes...</span>
                      </div>
                    ) : quizResults.length === 0 ? (
                      <p className="py-3 text-sm font-medium text-muted-foreground">No quizzes yet</p>
                    ) : (
                      quizResults.map((item) =>
                        item.result ? (
                          <button
                            key={item.result.id}
                            type="button"
                            onClick={() => {
                              router.push(`/quiz/${item.id}/results?resultId=${item.result?.id}`);
                              onClose();
                            }}
                            className="flex min-h-[38px] w-full items-center justify-between gap-3 rounded-[10px] px-1 text-left text-[14px] font-medium text-foreground transition-all active:scale-[0.98] active:bg-muted"
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            <span className="line-clamp-1">{item.title}</span>
                            <span className="shrink-0 text-sm font-bold text-muted-foreground">{item.result.percentage.toFixed(0)}%</span>
                          </button>
                        ) : null
                      )
                    )}
                  </div>
                )}
              </section>
            )}

            {showChatHistory && (
              <section className="pt-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent chats</h2>
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
            <button
              onClick={onClose}
              title={isIconOnly ? "Expand sidebar" : "Collapse sidebar"}
              className="p-2 text-foreground hover:bg-accent active:bg-accent/80 active:scale-95 rounded-lg transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <PanelLeft size={20} />
            </button>
          </div>

          {/* COMMENTED OUT: notes sidebar — re-enable by adding quickNotes={quickNotes} onOpenQuickNote={openQuickNoteModal} */}
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

          {isOnNotes && (
            <nav className={isIconOnly ? 'flex flex-col items-center py-1 gap-0.5' : 'px-2 space-y-0.5'}>
              <SidebarLink icon={MessageSquare} label="Chat" onClick={() => router.push('/main')} isIconOnly={isIconOnly} />
              <SidebarLink icon={BookOpen} label="Study" onClick={() => router.push('/reader')} isIconOnly={isIconOnly} />
              <SidebarLink icon={Brain} label="Quiz" onClick={() => router.push('/quiz')} isIconOnly={isIconOnly} />
              <SidebarLink icon={NotepadText} label="Notes" onClick={() => router.push('/notes')} isIconOnly={isIconOnly} active />
            </nav>
          )}

          {(isOnReader || isOnQuiz || isOnNotes) && !isIconOnly && (
            <SidebarChatHistorySection
              activeSessionId={activeSessionId}
              handleLoadSession={handleLoadSession}
              isLoadingHistory={isLoadingHistory}
              onDeleteRequest={onDeleteRequest}
              onRenameRequest={onRenameRequest}
              onSearchOpen={onSearchOpen}
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
                <span>Terms & Policies</span>
              </button>
              <button
                onClick={() => openHelpPage("/faq")}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted active:bg-muted/80"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <CircleHelp className="h-4 w-4 shrink-0" />
                <span>FAQ</span>
              </button>
              <button
                onClick={() => openHelpPage("/contact")}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted active:bg-muted/80"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Mail className="h-4 w-4 shrink-0" />
                <span>Contact Us</span>
              </button>
            </div>,
            document.body
          )
        : null}

      {/* COMMENTED OUT: quick-note modal — re-enable when ready */}
      {/* <div className={`fixed inset-0 z-[220] pointer-events-none transition-opacity duration-300 ${isQuickNoteModalOpen ? "opacity-100" : "opacity-0"}`}>
        <aside
          className={`fixed top-80 z-[221] flex h-[50dvh] w-[min(216px,calc(100vw-24px))] min-w-[216px] max-w-[216px] flex-col rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300 ease-out ${
            isQuickNoteModalOpen
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none -translate-y-2 scale-[0.985] opacity-0"
          }`}
          style={mounted ? { left: typeof window !== "undefined" && window.innerWidth >= 768 ? (isOpen ? 288 : 78) : 12 } : undefined}
        >
          <div className="relative flex items-center gap-2 border-b border-border px-4 py-3 w-full">
            <button
              onClick={closeQuickNoteModal}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Close quick note"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1 text-sm font-semibold text-foreground">{QUICK_NOTE_TITLE}</div>
            {isSavingQuickNote ? (
              <div className="flex items-center justify-center text-muted-foreground" title="Autosaving">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-visible px-5 pt-5 pb-8 w-full">
            <div className="h-full overflow-visible">
              <RichNoteEditor
                key={`${quickNoteId ?? "new"}-${quickNoteEditorRevision}`}
                initialContent={quickNoteContent}
                onChange={setQuickNoteContent}
                placeholder="Start writing your notes..."
                compact={false}
                editable
              />
            </div>
          </div>
        </aside>
      </div> */}
    </>
  );
}
