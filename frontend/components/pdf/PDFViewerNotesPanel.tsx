import { BookOpen, Check, Copy, Download, Loader2, Pencil, Send, Trash2, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { PDFNote } from './types';

const NoteCardSkeleton = () => (
  <div className="bg-background border border-border rounded-xl overflow-hidden animate-pulse">
    <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
      <div className="h-4 w-16 bg-muted rounded-full" />
      <div className="h-3 w-10 bg-muted rounded" />
    </div>
    <div className="px-3 pb-2">
      <div className="w-full h-20 bg-muted rounded-lg" />
    </div>
    <div className="px-3 pb-3 space-y-1.5">
      <div className="h-3 bg-muted rounded w-full" />
      <div className="h-3 bg-muted rounded w-4/5" />
      <div className="h-3 bg-muted rounded w-3/5" />
    </div>
  </div>
);

type PDFViewerNotesPanelProps = {
  copiedNotes: boolean;
  deletingNoteId: string | null;
  editingNoteId: string | null;
  editingText: string;
  expandedNotes: Set<string>;
  isExporting: boolean;
  isLoadingNotes: boolean;
  isOpen: boolean;
  isSavingEdit: boolean;
  isSavingNote: boolean;
  isSavingPersonal: boolean;
  notes: PDFNote[];
  onClose: () => void;
  onCopyNotes: () => void;
  onDeleteNote: (noteId: string | number) => void;
  onEditingTextChange: (value: string) => void;
  onExportPdf: () => Promise<void>;
  onPersonalNoteChange: (value: string) => void;
  onSaveEdit: (noteId: string) => Promise<void>;
  onSavePersonalNote: () => Promise<void>;
  onSetEditingNoteId: (noteId: string | null) => void;
  onSetEditingText: (value: string) => void;
  onStartEdit: (note: PDFNote) => void;
  onToggleExpanded: (noteId: string) => void;
  personalNote: string;
};

export function PDFViewerNotesPanel({
  copiedNotes,
  deletingNoteId,
  editingNoteId,
  editingText,
  expandedNotes,
  isExporting,
  isLoadingNotes,
  isOpen,
  isSavingEdit,
  isSavingNote,
  isSavingPersonal,
  notes,
  onClose,
  onCopyNotes,
  onDeleteNote,
  onEditingTextChange,
  onExportPdf,
  onPersonalNoteChange,
  onSaveEdit,
  onSavePersonalNote,
  onSetEditingNoteId,
  onSetEditingText,
  onStartEdit,
  onToggleExpanded,
  personalNote,
}: PDFViewerNotesPanelProps) {
  if (!isOpen) {
    return null;
  }

  const handlePersonalNoteKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      void onSavePersonalNote();
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 h-[75vh] rounded-t-2xl z-40 bg-card border-t border-border flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-300 lg:inset-auto lg:left-4 lg:top-20 lg:bottom-8 lg:w-72 lg:h-auto lg:max-h-[calc(100vh-6rem)] lg:rounded-xl lg:border lg:z-40 lg:shadow-2xl lg:animate-in lg:fade-in lg:slide-in-from-left-2 lg:duration-200">
        <div className="flex justify-center pt-2 pb-1 lg:hidden">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm text-foreground">
            My Notes
            {notes.length > 0 && (
              <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {notes.length}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-1">
            {notes.length > 0 && (
              <button
                onClick={onCopyNotes}
                className="relative group p-1.5 rounded-lg hover:bg-muted transition-colors"
                title="Copy notes"
              >
                {copiedNotes ? (
                  <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-popover text-foreground text-xs rounded shadow border border-border opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  {copiedNotes ? 'Copied!' : 'Copy notes'}
                </span>
              </button>
            )}

            {notes.length > 0 && (
              <button
                onClick={() => void onExportPdf()}
                disabled={isExporting}
                className="relative group p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-60"
                title={isExporting ? 'Generating…' : 'Export as PDF'}
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                ) : (
                  <Download className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-popover text-foreground text-xs rounded shadow border border-border opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  {isExporting ? 'Generating…' : 'Export PDF'}
                </span>
              </button>
            )}

            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {isLoadingNotes ? (
            <>
              <NoteCardSkeleton />
              <NoteCardSkeleton />
              <NoteCardSkeleton />
            </>
          ) : notes.length === 0 && !isSavingNote ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No notes yet.</p>
              <p className="text-xs mt-1">Snip a highlight and tap Save.</p>
            </div>
          ) : (
            <>
              {isSavingNote && <NoteCardSkeleton />}
              {notes.map((note) => (
                <div key={note.id} className="bg-background border border-border rounded-xl overflow-hidden group">
                  <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        note.category === 'Definition'
                          ? 'bg-blue-500/10 text-blue-500'
                          : note.category === 'Formula'
                            ? 'bg-amber-500/10 text-amber-500'
                            : note.category === 'Important'
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-emerald-500/10 text-emerald-500'
                      }`}
                    >
                      {note.category || 'Key Point'}
                    </span>
                    <div className="flex items-center gap-1">
                      {editingNoteId !== String(note.id) && (
                        <button
                          onClick={() => onStartEdit(note)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-muted transition-all"
                          title="Edit note"
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteNote(note.id)}
                        disabled={deletingNoteId === String(note.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 transition-all disabled:opacity-100"
                      >
                        {deletingNoteId === String(note.id) ? (
                          <Loader2 className="w-3.5 h-3.5 text-destructive animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        )}
                      </button>
                    </div>
                  </div>

                  {note.image_base64 && (
                    <div className="px-3 pb-2">
                      <img
                        src={`data:image/png;base64,${note.image_base64}`}
                        alt="Note snippet"
                        className="w-full rounded-lg border border-border object-contain max-h-28"
                      />
                    </div>
                  )}

                  {editingNoteId === String(note.id) ? (
                    <div className="px-3 pb-2 space-y-1.5">
                      <textarea
                        value={editingText}
                        onChange={(event) => onEditingTextChange(event.target.value)}
                        rows={4}
                        autoFocus
                        className="w-full resize-none rounded-lg border border-primary/30 bg-background text-base md:text-xs text-foreground p-2 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => void onSaveEdit(String(note.id))}
                          disabled={isSavingEdit || !editingText.trim()}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Save
                        </button>
                        <button
                          onClick={() => onSetEditingNoteId(null)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted text-muted-foreground text-[10px] font-medium hover:bg-muted/70 transition-colors"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : note.user_annotation ? (
                    <div className="px-3 pb-2">
                      <p className={`text-xs text-foreground leading-relaxed whitespace-pre-wrap ${expandedNotes.has(String(note.id)) ? '' : 'line-clamp-3'}`}>
                        {note.user_annotation}
                      </p>
                      {note.user_annotation.length > 80 && (
                        <button
                          onClick={() => onToggleExpanded(String(note.id))}
                          className="mt-1 text-[10px] font-medium text-primary hover:underline"
                        >
                          {expandedNotes.has(String(note.id)) ? 'Show less ↑' : 'Show more ↓'}
                        </button>
                      )}
                    </div>
                  ) : null}

                  {note.ai_explanation && (
                    <div className="px-3 pb-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">{note.ai_explanation}</p>
                    </div>
                  )}

                  {note.page_number && (
                    <div className="px-3 pb-2.5">
                      <span className="text-[10px] text-muted-foreground/60">Page {note.page_number}</span>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="px-3 py-3 border-t border-border space-y-2">
          <textarea
            value={personalNote}
            onChange={(event) => onPersonalNoteChange(event.target.value)}
            onKeyDown={handlePersonalNoteKeyDown}
            placeholder="Write your own note… (Ctrl+Enter to save)"
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background text-base md:text-xs text-foreground placeholder:text-muted-foreground/60 p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
          <button
            onClick={() => void onSavePersonalNote()}
            disabled={!personalNote.trim() || isSavingPersonal}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSavingPersonal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Add note
          </button>
        </div>
      </div>
    </>
  );
}
