"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { PDFNote, BlockNoteContent } from "@/types/types";
import dynamic from "next/dynamic";
import { useSidebarControls } from "@/lib/sidebar-controls";

const RichNoteEditor = dynamic(() => import("@/components/notes/RichNoteEditor"), { ssr: false });
import { Trash2, NotepadText, Check, Loader2, ChevronLeft, PenSquare, Search, X, BookOpen, PanelLeft, MoreVertical, AlertCircle } from "lucide-react";
import ReportProblemModal from "@/components/ReportProblemModal";

type DocumentMeta = {
  id: string | number;
  course_code?: string;
  topic?: string;
};
const QUICK_NOTE_TAG_PREFIX = "quick:v1";
const QUICK_NOTE_TITLE = "Quick notes";
const QUICK_NOTE_STORAGE_KEY = "pansgpt_quick_note_persistent";

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString();
}

function extractFullPlainText(content?: BlockNoteContent): string {
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object" || !Array.isArray((block as Record<string, unknown>).content)) continue;
    const inline = (block as Record<string, unknown>).content as unknown[];
    const blockParts: string[] = [];
    for (const item of inline) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      if (entry.type === "text" && typeof entry.text === "string") {
        blockParts.push(entry.text);
      }
    }
    if (blockParts.length > 0) parts.push(blockParts.join(""));
  }

  return parts.join("\n\n").trim();
}

function extractPlainTextPreview(content?: BlockNoteContent): string {
  const fullText = extractFullPlainText(content);
  return fullText.replace(/\n+/g, " ").slice(0, 60);
}

function getEditableTitle(title?: string | null): string {
  return typeof title === "string" ? title : "";
}

function getDisplayTitle(title?: string | null): string {
  const normalized = typeof title === "string" ? title.trim() : "";
  return normalized || "Untitled note";
}

function isQuickNote(note: PDFNote): boolean {
  return Array.isArray(note.tags) && note.tags.some((tag) => typeof tag === "string" && tag.startsWith(QUICK_NOTE_TAG_PREFIX));
}

function getDashboardQuickNoteId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(QUICK_NOTE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { noteId?: string | null };
    return parsed?.noteId ? String(parsed.noteId) : null;
  } catch {
    return null;
  }
}

function getDashboardQuickNoteState(): { noteId: string | null; content: BlockNoteContent } {
  if (typeof window === "undefined") return { noteId: null, content: [] };
  try {
    const raw = localStorage.getItem(QUICK_NOTE_STORAGE_KEY);
    if (!raw) return { noteId: null, content: [] };
    const parsed = JSON.parse(raw) as { noteId?: string | null; content?: BlockNoteContent };
    return {
      noteId: parsed?.noteId ? String(parsed.noteId) : null,
      content: Array.isArray(parsed?.content) ? parsed.content : [],
    };
  } catch {
    return { noteId: null, content: [] };
  }
}

function hasMeaningfulContent(content?: BlockNoteContent): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (!block || typeof block !== "object") return false;
    if ((block as Record<string, unknown>).type === "image") return true;
    const inline = (block as Record<string, unknown>).content;
    if (!Array.isArray(inline)) return false;
    return inline.some((item) => {
      if (!item || typeof item !== "object") return false;
      const text = (item as Record<string, unknown>).text;
      return typeof text === "string" && text.trim().length > 0;
    });
  });
}

function contentSignature(content?: BlockNoteContent): string {
  return JSON.stringify(Array.isArray(content) ? content : []);
}

function formatEditedDate(dateString?: string | null): string {
  if (!dateString) return "Edited recently";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Edited recently";
  return `Edited ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function NotesPageContent() {
  const searchParams = useSearchParams();
  const { toggle: toggleSidebar } = useSidebarControls();
  const [notes, setNotes] = useState<PDFNote[]>([]);
  const [quickNote, setQuickNote] = useState<PDFNote | null>(null);
  const [selectedNote, setSelectedNote] = useState<PDFNote | null>(null);
  const [documentMetaById, setDocumentMetaById] = useState<Record<string, DocumentMeta>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const [titleInput, setTitleInput] = useState("");
  const [isMobileView, setIsMobileView] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [showTags, setShowTags] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"date">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  const titleSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const fetchNotes = useCallback(async (search = "") => {
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      
      const res = await api.get(`/notes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const allNotes: PDFNote[] = Array.isArray(data.notes) ? data.notes : [];
        const quickCandidates = allNotes.filter(isQuickNote);
        const dashboardState = getDashboardQuickNoteState();
        let quick =
          (dashboardState.noteId ? quickCandidates.find((note) => String(note.id) === dashboardState.noteId) : null) ||
          quickCandidates.sort((a, b) => {
            const aTime = new Date(a.last_edited_at || a.created_at).getTime();
            const bTime = new Date(b.last_edited_at || b.created_at).getTime();
            return bTime - aTime;
          })[0] ||
          null;

        const localCacheMatchesQuickNote = Boolean(quick && dashboardState.noteId && String(quick.id) === dashboardState.noteId);
        const localCacheHasContent = hasMeaningfulContent(dashboardState.content);
        const quickNeedsSync =
          Boolean(quick) && localCacheMatchesQuickNote && localCacheHasContent && (
            contentSignature(quick.content) !== contentSignature(dashboardState.content) ||
            quick?.document_id !== null && quick?.document_id !== undefined
          );

        if (quick && quickNeedsSync) {
          const syncRes = await api.patch(`/notes/${quick.id}`, {
            title: QUICK_NOTE_TITLE,
            content: dashboardState.content,
            tags: [QUICK_NOTE_TAG_PREFIX],
            document_id: null,
          });
          if (syncRes.ok) {
            quick = await syncRes.json();
          }
        }

        if (!quick && hasMeaningfulContent(dashboardState.content)) {
          const createRes = await api.post("/notes", {
            title: QUICK_NOTE_TITLE,
            content: dashboardState.content,
            tags: [QUICK_NOTE_TAG_PREFIX],
            document_id: null,
          });
          if (createRes.ok) {
            quick = await createRes.json();
          }
        }

        const staleQuickNotes = quickCandidates.filter((note) => !quick || String(note.id) !== String(quick.id));
        if (staleQuickNotes.length > 0) {
          await Promise.all(staleQuickNotes.map((note) => api.delete(`/notes/${note.id}`)));
        }

        if (quick && typeof window !== "undefined") {
          localStorage.setItem(QUICK_NOTE_STORAGE_KEY, JSON.stringify({
            noteId: String(quick.id),
            content: Array.isArray(quick.content) ? quick.content : dashboardState.content,
          }));
        }
        const regular = allNotes.filter((note) => !isQuickNote(note));
        setQuickNote(quick);
        setNotes(regular);
        return { regular, quick };
      }
    } catch (e) {
      console.error("Failed to fetch notes", e);
    }
    return { regular: [] as PDFNote[], quick: null as PDFNote | null };
  }, []);

  const broadcastNotesUpdate = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("pansgpt-notes-updated"));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleNotesUpdated = () => {
      void fetchNotes(searchQuery).then((fetched) => {
        if (selectedNote && isQuickNote(selectedNote) && fetched.quick) {
          setSelectedNote(fetched.quick);
          setTitleInput(getEditableTitle(fetched.quick.title));
        }
      });
    };

    window.addEventListener("pansgpt-notes-updated", handleNotesUpdated);
    return () => window.removeEventListener("pansgpt-notes-updated", handleNotesUpdated);
  }, [fetchNotes, searchQuery, selectedNote]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    fetchNotes().then(fetched => {
      const preferredNoteId = searchParams.get("note");
      const preferred = preferredNoteId
        ? fetched.regular.find((note: PDFNote) => String(note.id) === preferredNoteId) || (fetched.quick && String(fetched.quick.id) === preferredNoteId ? fetched.quick : null)
        : null;

      if (!isMobileView && (fetched.regular.length > 0 || fetched.quick)) {
        const initial = preferred || fetched.regular[0] || fetched.quick;
        setSelectedNote(initial);
        setTitleInput(getEditableTitle(initial.title));
      } else {
        setSelectedNote(null);
        setTitleInput("");
      }
      setIsLoading(false);
    });
  }, [fetchNotes, isMobileView, searchParams]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await api.get("/documents");
        if (!res.ok) return;
        const docs = (await res.json()) as DocumentMeta[];
        if (cancelled || !Array.isArray(docs)) return;

        const mapped = docs.reduce<Record<string, DocumentMeta>>((acc, doc) => {
          if (doc?.id !== undefined && doc?.id !== null) {
            acc[String(doc.id)] = doc;
          }
          return acc;
        }, {});

        setDocumentMetaById(mapped);
      } catch (error) {
        console.error("Failed to fetch documents metadata", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Handle Search/Filters
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    
    searchTimeout.current = setTimeout(async () => {
      setIsLoading(true);
      const fetched = await fetchNotes(searchQuery);

      if (fetched.regular.length > 0 || fetched.quick) {
        const selectedStillExists = selectedNote
          ? fetched.regular.some((n: PDFNote) => n.id === selectedNote.id) || (fetched.quick?.id === selectedNote.id)
          : false;

        if (!selectedStillExists && !isMobileView) {
          const initial = fetched.regular[0] || fetched.quick;
          if (initial) {
            setSelectedNote(initial);
            setTitleInput(getEditableTitle(initial.title));
          }
        } else if (!selectedStillExists && isMobileView) {
          setSelectedNote(null);
          setTitleInput("");
        }
      } else {
        setSelectedNote(null);
        setTitleInput("");
      }
      setIsLoading(false);
    }, 400);
    
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const updateLocalNote = (id: string, updates: Partial<PDFNote>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    if (quickNote?.id === id) {
      setQuickNote(prev => prev ? { ...prev, ...updates } : prev);
    }
    if (selectedNote?.id === id) {
      setSelectedNote(prev => prev ? { ...prev, ...updates } : prev);
    }
  };

  const showSaved = () => {
    setShowSavedIndicator(true);
    setTimeout(() => setShowSavedIndicator(false), 2000);
  };

  const handleNewNote = async () => {
    setIsSaving(true);
    try {
      const res = await api.post("/notes", {
        title: null,
        content: [],
        tags: [],
        document_id: null
      });
      if (res.ok) {
        const newNote = await res.json();
        setNotes(prev => [newNote, ...prev]);
        setSelectedNote(newNote);
        setTitleInput("");
        broadcastNotesUpdate();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setDeleteTargetId(null);
  };

  const handleDeleteRequest = (id: string) => {
    setDeleteTargetId(id);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteNote = async () => {
    if (!deleteTargetId) return;
    const isMultiple = deleteTargetId === "multiple";
    const targetIds = isMultiple ? Array.from(selectedNoteIds) : [deleteTargetId];
    if (targetIds.length === 0) return;

    closeDeleteModal();
    try {
      // Execute deletions in parallel
      await Promise.all(targetIds.map((id) => api.delete(`/notes/${id}`)));

      const filtered = notes.filter((n) => !targetIds.includes(String(n.id)));
      setNotes(filtered);
      broadcastNotesUpdate();

      if (isSelectionMode) {
        setIsSelectionMode(false);
        setSelectedNoteIds(new Set());
      }

      if (selectedNote && targetIds.includes(String(selectedNote.id))) {
        if (!isMobileView && filtered.length > 0) {
          setSelectedNote(filtered[0]);
          setTitleInput(getEditableTitle(filtered[0].title));
        } else {
          setSelectedNote(null);
          setTitleInput("");
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTitleChange = (val: string) => {
    if (selectedNote && isQuickNote(selectedNote)) return;
    setTitleInput(val);
    if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current);
    
    titleSaveTimeout.current = setTimeout(async () => {
      if (!selectedNote) return;
      const payloadTitle = val.trim() ? val : null;
      setIsSaving(true);
      try {
        const res = await api.patch(`/notes/${selectedNote.id}`, { title: payloadTitle });
      if (res.ok) {
        const updated = await res.json();
        updateLocalNote(selectedNote.id, {
          title: typeof updated.title === "string" ? updated.title : null,
          last_edited_at: updated.last_edited_at,
        });
        showSaved();
      }
      } finally {
        setIsSaving(false);
      }
    }, 1500);
  };

  const handleEditorChange = async (content: BlockNoteContent) => {
    if (!selectedNote) return;
    setIsSaving(true);
    try {
      const payload = isQuickNote(selectedNote)
        ? { content, tags: [QUICK_NOTE_TAG_PREFIX], title: QUICK_NOTE_TITLE }
        : { content };
      const res = await api.patch(`/notes/${selectedNote.id}`, payload);
      if (res.ok) {
        const updated = await res.json();
        updateLocalNote(selectedNote.id, { content: updated.content, last_edited_at: updated.last_edited_at });
        if (isQuickNote(selectedNote) && typeof window !== "undefined") {
          localStorage.setItem(QUICK_NOTE_STORAGE_KEY, JSON.stringify({
            noteId: String(selectedNote.id),
            content: updated.content,
          }));
          broadcastNotesUpdate();
        }
        showSaved();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectNote = (note: PDFNote) => {
    setSelectedNote(note);
    setTitleInput(getEditableTitle(note.title));
  };

  const handleOpenQuickNote = async () => {
    if (quickNote) {
      setSelectedNote(quickNote);
      setTitleInput(getEditableTitle(quickNote.title));
      return;
    }

    setIsSaving(true);
    try {
      const fetched = await fetchNotes();
      if (fetched.quick) {
        setQuickNote(fetched.quick);
        setSelectedNote(fetched.quick);
        setTitleInput(getEditableTitle(fetched.quick.title));
        return;
      }

      const dashboardState = getDashboardQuickNoteState();
      const createRes = await api.post("/notes", {
        title: QUICK_NOTE_TITLE,
        content: hasMeaningfulContent(dashboardState.content) ? dashboardState.content : [],
        tags: [QUICK_NOTE_TAG_PREFIX],
        document_id: null,
      });
      if (!createRes.ok) return;
      const created = await createRes.json();
      if (typeof window !== "undefined") {
        localStorage.setItem(QUICK_NOTE_STORAGE_KEY, JSON.stringify({
          noteId: String(created.id),
          content: Array.isArray(created.content) ? created.content : dashboardState.content,
        }));
      }
      setQuickNote(created);
      setSelectedNote(created);
      setTitleInput(getEditableTitle(created.title));
      broadcastNotesUpdate();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportAllNotes = () => {
    setShowListMenu(false);
    let exportText = "All Notes Export\n====================\n\n";
    
    sortedNotes.forEach((note) => {
      exportText += `--- ${getDisplayTitle(note.title)} ---\n`;
      const date = new Date(note.created_at);
      if (!Number.isNaN(date.getTime())) {
        exportText += `Date: ${date.toLocaleString()}\n\n`;
      }
      exportText += extractFullPlainText(note.content) + "\n\n\n";
    });

    const blob = new Blob([exportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `All_Notes_Export_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedDocumentMeta = selectedNote?.document_id
    ? documentMetaById[String(selectedNote.document_id)]
    : undefined;
  const isSelectedQuickNote = Boolean(selectedNote && isQuickNote(selectedNote));

  // Derive sorted notes
  const sortedNotes = [...notes].sort((a, b) => {
    const dateA = new Date(a.last_edited_at || a.created_at).getTime();
    const dateB = new Date(b.last_edited_at || b.created_at).getTime();
    return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
  });

  return (
    <div className="h-[100dvh] w-full flex overflow-hidden bg-background">
      {/* Sidebar - hidden on mobile when note is selected */}
      <div className={`h-full shrink-0 md:block ${selectedNote ? 'hidden' : 'block w-full'}`}>
        <div className="relative w-full md:w-[280px] h-full flex flex-col bg-card border-l border-r border-border shrink-0">
          <div className="p-4 flex flex-col gap-4 border-b border-border">
            {isSelectionMode ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setIsSelectionMode(false);
                      setSelectedNoteIds(new Set());
                    }}
                    className="p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    <X size={20} />
                  </button>
                  <span className="text-sm font-semibold text-foreground">
                    {selectedNoteIds.size} selected
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (selectedNoteIds.size > 0) {
                      setDeleteTargetId('multiple');
                      setIsDeleteModalOpen(true);
                    }
                  }}
                  disabled={selectedNoteIds.size === 0}
                  className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                  title="Delete selected"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSidebar}
                    className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                    aria-label="Toggle app sidebar"
                  >
                    <PanelLeft size={18} />
                  </button>
                  <h2 className="text-xl font-semibold text-foreground">Notes</h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void handleNewNote()}
                    className="hidden md:flex p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                    title="Create new note"
                  >
                    <PenSquare size={20} />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowListMenu(!showListMenu)}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                      title="More options"
                    >
                      <MoreVertical size={20} />
                    </button>
                    {showListMenu && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setShowListMenu(false)} 
                        />
                        <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden py-1">
                          <button 
                            onClick={() => { 
                              setShowListMenu(false);
                              setIsSelectionMode(true);
                              setSelectedNoteIds(new Set());
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                          >
                            Select multiple
                          </button>
                          <button 
                            onClick={() => { 
                              setShowListMenu(false);
                              setSortOrder(sortOrder === "desc" ? "asc" : "desc");
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors flex items-center justify-between"
                          >
                            Sort by date
                            <span className="text-xs text-muted-foreground">{sortOrder === "desc" ? "↓" : "↑"}</span>
                          </button>
                          <div className="h-px bg-border my-1 mx-2" />
                          <button 
                            onClick={handleExportAllNotes}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                          >
                            Export all notes
                          </button>
                          <div className="h-px bg-border my-1 mx-2" />
                          <button 
                            onClick={() => { 
                              setShowListMenu(false); 
                              setIsReportModalOpen(true);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                          >
                            Report a problem
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-accent text-sm text-foreground rounded-lg pl-9 pr-9 py-2 outline-none border border-transparent focus:border-border transition-colors"
                disabled={isSelectionMode}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground hover:bg-accent/80 rounded-md transition-colors"
                  aria-label="Clear search"
                  disabled={isSelectionMode}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
            ) : notes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground gap-3">
                <NotepadText size={48} className="opacity-20" />
                <p className="text-sm">{searchQuery ? "No results found" : "No notes yet"}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {sortedNotes.map((note, idx) => {
                  const isActive = note.id === selectedNote?.id;
                  const isSelected = selectedNoteIds.has(String(note.id));
                  const snippet = extractPlainTextPreview(note.content) || note.user_annotation || "Empty note...";

                  return (
                    <div key={note.id}>
                      <button
                        onClick={() => {
                          if (isSelectionMode) {
                            const newSet = new Set(selectedNoteIds);
                            const idStr = String(note.id);
                            if (newSet.has(idStr)) newSet.delete(idStr);
                            else newSet.add(idStr);
                            setSelectedNoteIds(newSet);
                          } else {
                            handleSelectNote(note);
                          }
                        }}
                        className={`w-full text-left p-3 rounded-xl transition-colors flex gap-3 ${
                          isActive && !isSelectionMode ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 text-muted-foreground"
                        }`}
                      >
                        {isSelectionMode && (
                          <div className="flex-shrink-0 pt-0.5">
                            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5 w-full overflow-hidden">
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className={`font-medium truncate text-sm flex-1 ${isActive && !isSelectionMode ? "text-foreground" : ""}`}>
                              {getDisplayTitle(note.title)}
                            </span>
                            {note.document_id && documentMetaById[String(note.document_id)]?.course_code && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {documentMetaById[String(note.document_id)]?.course_code}
                              </span>
                            )}
                          </div>
                          <p className="text-xs truncate opacity-70 w-full">{snippet}</p>
                          <span className="text-[10px] opacity-50 mt-0.5">
                            {formatRelativeTime(note.last_edited_at || note.created_at)}
                          </span>
                        </div>
                      </button>
                      {idx < sortedNotes.length - 1 && <div className="mx-3 my-0.5 border-b border-border/60" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-border px-2 py-2">
            <button
              onClick={() => void handleOpenQuickNote()}
              className={`w-full h-[42px] flex items-center gap-2 px-1.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] active:bg-muted/60 ${
                isSelectedQuickNote ? "bg-primary/10 text-primary" : "text-foreground/80 hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <NotepadText className="h-[18px] w-[18px] shrink-0" />
              <span>Quick notes</span>
            </button>
          </div>

          <button
            onClick={() => void handleNewNote()}
            className="md:hidden absolute bottom-5 right-5 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-70"
            aria-label="Create new note"
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <PenSquare className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className={`flex-1 h-full flex flex-col min-w-0 ${selectedNote ? 'block' : 'hidden md:flex'}`}>
        {!selectedNote ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4 px-6 text-center">
            <NotepadText size={64} className="opacity-20" />
            <p className="max-w-[280px] leading-relaxed px-4 text-center">Select a note or create a new one</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="px-3 md:px-8 pt-3 pb-0 shrink-0 flex flex-col gap-1">
              
              {/* Mobile Top Bar */}
              <div className="flex md:hidden items-center justify-between w-full mb-1">
                <button 
                  className="p-1.5 -ml-1 text-muted-foreground hover:bg-accent rounded-lg transition-colors"
                  onClick={() => setSelectedNote(null)}
                >
                  <ChevronLeft size={24} />
                </button>
                <div className="relative">
                  <button 
                    onClick={() => setShowMobileMenu(!showMobileMenu)}
                    className="p-1.5 text-muted-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    <MoreVertical size={20} />
                  </button>
                  {showMobileMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowMobileMenu(false)} 
                      />
                      <div className="absolute right-0 top-full mt-1 w-36 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                        <button 
                          onClick={() => { setShowTags(!showTags); setShowMobileMenu(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors border-b border-border"
                        >
                          {showTags ? "Hide tags" : "Show tags"}
                        </button>
                        {!isSelectedQuickNote && (
                          <button 
                            onClick={() => { handleDeleteRequest(selectedNote.id); setShowMobileMenu(false); }}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-destructive hover:bg-red-500/10 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Title Input & Desktop Actions */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder={isSelectedQuickNote ? QUICK_NOTE_TITLE : "New note"}
                  readOnly={isSelectedQuickNote}
                  className="flex-1 text-2xl md:text-3xl font-bold bg-transparent outline-none border-none text-foreground placeholder:text-muted-foreground"
                />

                {!isSelectedQuickNote && (
                  <button
                    onClick={() => handleDeleteRequest(selectedNote.id)}
                    className="hidden md:flex shrink-0 p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete Note"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              {/* Tags Area */}
              <div className={`flex flex-wrap items-center text-[12px] font-medium text-muted-foreground/80 ${!showTags && isMobileView ? 'hidden' : ''}`}>
                {!isSelectedQuickNote && selectedDocumentMeta?.course_code ? (
                  <>
                    <span>{selectedDocumentMeta.course_code}</span>
                    <span className="mx-2 text-border">|</span>
                  </>
                ) : null}
                {!isSelectedQuickNote && selectedDocumentMeta?.topic ? (
                  <>
                    <span>{selectedDocumentMeta.topic}</span>
                    <span className="mx-2 text-border">|</span>
                  </>
                ) : null}
                <span>{formatEditedDate(selectedNote.last_edited_at || selectedNote.created_at)}</span>
              </div>

              {/* Status + Divider */}
              <div className="flex items-center justify-end border-b border-border pb-1 mt-0">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 h-6">
                  {isSaving ? (
                    <><Loader2 size={12} className="animate-spin" /> Saving...</>
                  ) : showSavedIndicator ? (
                    <><Check size={12} className="text-green-500" /> Saved</>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 overflow-y-auto px-3 md:px-8 pb-20 md:pb-8">
              <RichNoteEditor
                // Key forces re-mount if selectedNote changes so BlockNote updates its initialContent
                key={selectedNote.id}
                initialContent={selectedNote.content || []}
                onChange={handleEditorChange}
                editable={true}
                compact={false}
              />
            </div>
          </div>
        )}
      </div>

      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-sm w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">
                  {deleteTargetId === "multiple" ? "Delete Notes" : "Delete Note"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {deleteTargetId === "multiple" 
                    ? `Are you sure you want to delete ${selectedNoteIds.size} notes? This cannot be undone.` 
                    : "This cannot be undone."}
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={closeDeleteModal}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDeleteNote()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportProblemModal 
        isOpen={isReportModalOpen} 
        onClose={() => setIsReportModalOpen(false)} 
      />
    </div>
  );
}

export default function NotesPage() {
  return (
    <React.Suspense fallback={<div className="h-[100dvh] w-full bg-background" />}>
      <NotesPageContent />
    </React.Suspense>
  );
}
