"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { Bug, ChevronRight, CircleHelp, FileText, Mail, PanelLeft, Settings, NotepadText, MessageSquare, BookOpen, Brain, X, Loader2 } from "lucide-react";
import Logo from "@/components/Logo";
import { useChatSession } from "@/lib/ChatSessionContext";
import { MainSidebarContent } from "@/components/sidebar/MainSidebarContent";
import { StudySidebarContent } from "@/components/sidebar/StudySidebarContent";
import { QuizSidebarContent } from "@/components/sidebar/QuizSidebarContent";
import { QuizFilterModal } from "@/components/sidebar/QuizFilterModal";
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
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
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
          fixed inset-y-0 left-0 z-[100] w-[80vw] max-w-sm transform transition-transform duration-300 bg-card
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:inset-auto md:z-[100] md:max-w-none md:translate-x-0
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
              quickNotes={quickNotes}
              onOpenQuickNote={openQuickNoteModal}
              routerPush={(path) => router.push(path)}
              sessions={sessions}
              setOpenMenuId={setOpenMenuId}
            />
          )}

          {isOnReader && (
            <StudySidebarContent
              isIconOnly={isIconOnly}
              pathname={pathname}
              quickNotes={quickNotes}
              onOpenQuickNote={openQuickNoteModal}
              routerPush={(path) => router.push(path)}
            />
          )}

          {isOnQuiz && (
            <QuizSidebarContent
              hasActiveFilters={hasActiveFilters}
              isIconOnly={isIconOnly}
              pathname={pathname}
              quickNotes={quickNotes}
              quizLoading={quizLoading}
              quizResults={quizResults}
              routerPush={(path) => router.push(path)}
              showFilters={() => setShowFilterModal(true)}
              onOpenQuickNote={openQuickNoteModal}
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

      <div className={`fixed inset-0 z-[220] pointer-events-none transition-opacity duration-300 ${isQuickNoteModalOpen ? "opacity-100" : "opacity-0"}`}>
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
          <style jsx global>{`
            .bn-suggestion-menu,
            [data-floating-ui-portal] {
              z-index: 260 !important;
            }
          `}</style>
        </aside>
      </div>
    </>
  );
}
