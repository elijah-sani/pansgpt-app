import { Copy, Download, Loader2, MoreVertical, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import RichNoteEditor from '@/components/notes/RichNoteEditor';
import { api } from '@/lib/api';
import type { BlockNoteContent } from '@/types/types';

type NotePayload = {
  id: string | number;
  title?: string | null;
  content?: BlockNoteContent | null;
  image_base64?: string | null;
  user_annotation?: string | null;
  tags?: string[] | null;
  page_number?: number | null;
};

type SourceLocation = {
  page: number;
  rect?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
};

type ExportLine = {
  text: string;
  variant: 'heading' | 'body';
};

type PDFViewerNotesPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  documentId?: string;
  documentTitle?: string;
  currentPage: number;
  onNoteChanged?: () => void;
  onJumpToSource?: (source: SourceLocation) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const extractPlainText = (blocks: BlockNoteContent): string => {
  if (!Array.isArray(blocks)) return '';

  const pieces: string[] = [];
  for (const block of blocks) {
    if (!isRecord(block) || !Array.isArray(block.content)) continue;

    for (const item of block.content) {
      if (!isRecord(item)) continue;
      if (item.type === 'text' && typeof item.text === 'string') {
        pieces.push(item.text);
      }
    }
  }

  return pieces.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const buildExportLines = (blocks: BlockNoteContent): ExportLine[] => {
  if (!Array.isArray(blocks)) return [];

  const lines: ExportLine[] = [];
  let numberedIndex = 1;

  for (const block of blocks) {
    if (!isRecord(block)) continue;

    const type = typeof block.type === 'string' ? block.type : 'paragraph';
    const blockContent = Array.isArray(block.content) ? block.content : [];
    const parts: string[] = [];

    for (const item of blockContent) {
      if (!isRecord(item)) continue;
      if (item.type === 'text' && typeof item.text === 'string') {
        parts.push(item.text);
      }
    }

    const text = parts.join('').trim();
    if (!text) continue;

    if (type === 'heading' || type.startsWith('heading')) {
      lines.push({ text, variant: 'heading' });
    } else if (type === 'bulletListItem') {
      lines.push({ text: `* ${text}`, variant: 'body' });
    } else if (type === 'numberedListItem') {
      lines.push({ text: `${numberedIndex}. ${text}`, variant: 'body' });
      numberedIndex += 1;
    } else {
      lines.push({ text, variant: 'body' });
    }
  }

  return lines;
};

const buildSignature = (title: string, content: BlockNoteContent): string =>
  JSON.stringify({ title: title.trim(), content });

const buildImageBlock = (imageBase64: string): Record<string, unknown> => ({
  type: 'image',
  props: {
    url: `data:image/png;base64,${imageBase64}`,
    name: 'Snip',
    caption: '',
    showPreview: true,
    previewWidth: 420,
  },
});

const buildParagraphBlock = (text: string): Record<string, unknown> => ({
  type: 'paragraph',
  content: [
    {
      type: 'text',
      text,
      styles: {},
    },
  ],
});

const normalizeLoadedContent = (note: NotePayload | null): BlockNoteContent => {
  if (!note) return [];
  if (Array.isArray(note.content) && note.content.length > 0) {
    return note.content;
  }

  const fallbackBlocks: Record<string, unknown>[] = [];
  if (typeof note.image_base64 === 'string' && note.image_base64.trim().length > 0) {
    fallbackBlocks.push(buildImageBlock(note.image_base64));
  }
  if (typeof note.user_annotation === 'string' && note.user_annotation.trim().length > 0) {
    fallbackBlocks.push(buildParagraphBlock(note.user_annotation.trim()));
  }

  return fallbackBlocks as BlockNoteContent;
};

const parseLocationTag = (tag: string): SourceLocation | null => {
  if (!tag.startsWith('loc:v1;')) return null;

  const parts = tag.split(';').slice(1);
  const map = new Map<string, string>();
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!key || value === undefined) continue;
    map.set(key, value);
  }

  const page = Number(map.get('p'));
  if (!Number.isFinite(page)) return null;

  const x = Number(map.get('x'));
  const y = Number(map.get('y'));
  const w = Number(map.get('w'));
  const h = Number(map.get('h'));

  const hasRect = [x, y, w, h].every((value) => Number.isFinite(value));
  if (!hasRect) {
    return { page };
  }

  return {
    page,
    rect: { x, y, w, h },
  };
};

export function PDFViewerNotesPanel({ isOpen, onClose, documentId, documentTitle, currentPage, onNoteChanged, onJumpToSource }: PDFViewerNotesPanelProps) {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<BlockNoteContent>([]);
  const [editorKey, setEditorKey] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [latestSource, setLatestSource] = useState<SourceLocation | null>(null);

  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = useRef('');
  const isHydratingRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const noteIdRef = useRef<string | null>(null);
  const titleRef = useRef('');
  const contentRef = useRef<BlockNoteContent>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const autosaveInFlightRef = useRef(0);

  const defaultNoteTitle = useMemo(() => {
    const resolved = typeof documentTitle === 'string' ? documentTitle.trim() : '';
    return resolved ? `${resolved} - Notes` : 'My Notes';
  }, [documentTitle]);

  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const queueSave = useCallback(
    (nextTitle: string, nextContent: BlockNoteContent) => {
      if (!isOpen || !documentId) return;

      const normalizedTitle = nextTitle.trim();
      const hasText = extractPlainText(nextContent).length > 0;
      if (!normalizedTitle && !hasText) return;

      const signature = buildSignature(nextTitle, nextContent);
      if (signature === lastSavedSignatureRef.current) return;

      saveChainRef.current = saveChainRef.current.then(async () => {
        if (!isOpen || !documentId) return;
        if (signature === lastSavedSignatureRef.current) return;

        autosaveInFlightRef.current += 1;
        setIsAutosaving(true);
        try {
          if (!noteIdRef.current) {
            const res = await api.post('/notes', {
              title: normalizedTitle || null,
              content: nextContent,
              document_id: documentId,
              page_number: currentPage,
            });

            if (!res.ok) {
              throw new Error(`Save failed: ${res.status}`);
            }

            const saved = (await res.json()) as NotePayload;
            const savedId = String(saved.id);
            noteIdRef.current = savedId;
            setNoteId(savedId);
          } else {
            const res = await api.patch(`/notes/${noteIdRef.current}`, {
              title: normalizedTitle || null,
              content: nextContent,
            });

            if (!res.ok) {
              throw new Error(`Update failed: ${res.status}`);
            }
          }

          lastSavedSignatureRef.current = signature;
          onNoteChanged?.();
        } catch (error) {
          console.error('Autosave failed', error);
          toast.error('Unable to save note');
        } finally {
          autosaveInFlightRef.current = Math.max(0, autosaveInFlightRef.current - 1);
          if (autosaveInFlightRef.current === 0) {
            setIsAutosaving(false);
          }
        }
      });
    },
    [currentPage, documentId, isOpen, onNoteChanged],
  );

  useEffect(() => {
    return () => {
      if (titleDebounceRef.current) {
        clearTimeout(titleDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!isOpen || !documentId) return;

    const controller = new AbortController();
    isHydratingRef.current = true;
    setTitle(defaultNoteTitle);

    void (async () => {
      try {
        const res = await api.get(`/notes/${documentId}`, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Load failed: ${res.status}`);
        }

        const data = (await res.json()) as NotePayload | null;
        if (controller.signal.aborted) return;

        if (data) {
          const loadedTitleRaw = typeof data.title === 'string' ? data.title.trim() : '';
          const loadedTitle = loadedTitleRaw || defaultNoteTitle;
          const loadedContent = normalizeLoadedContent(data);
          const loadedId = String(data.id);

          noteIdRef.current = loadedId;
          setNoteId(loadedId);
          setTitle(loadedTitle);
          setContent(loadedContent);
          const candidateTags = Array.isArray(data.tags) ? data.tags : [];
          const parsedTagSource =
            [...candidateTags]
              .reverse()
              .map((tag) => (typeof tag === 'string' ? parseLocationTag(tag) : null))
              .find((source): source is SourceLocation => Boolean(source)) || null;
          const fallbackSource =
            data.page_number && Number.isFinite(Number(data.page_number))
              ? { page: Number(data.page_number) }
              : null;
          setLatestSource(parsedTagSource || fallbackSource);
          lastSavedSignatureRef.current = buildSignature(loadedTitle, loadedContent);
        } else {
          noteIdRef.current = null;
          setNoteId(null);
          setTitle(defaultNoteTitle);
          setContent([]);
          setLatestSource(null);
          lastSavedSignatureRef.current = buildSignature(defaultNoteTitle, []);
        }

        setEditorKey((prev) => prev + 1);
        setMenuOpen(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Failed to load note', error);
        toast.error('Unable to load note');
      } finally {
        if (!controller.signal.aborted) {
          isHydratingRef.current = false;
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [defaultNoteTitle, documentId, isOpen]);

  const handleJumpToSource = () => {
    if (!latestSource || !onJumpToSource) return;
    onJumpToSource(latestSource);
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!isOpen || !documentId || isHydratingRef.current) return;

    if (titleDebounceRef.current) {
      clearTimeout(titleDebounceRef.current);
    }

    titleDebounceRef.current = setTimeout(() => {
      queueSave(titleRef.current, contentRef.current);
    }, 1500);

    return () => {
      if (titleDebounceRef.current) {
        clearTimeout(titleDebounceRef.current);
      }
    };
  }, [documentId, isOpen, queueSave, title]);

  useEffect(() => {
    if (!isOpen || !documentId || isHydratingRef.current) return;
    queueSave(titleRef.current, content);
  }, [content, documentId, isOpen, queueSave]);

  const handleCopy = async () => {
    try {
      const plainText = `${title.trim()}\n\n${extractPlainText(content)}`.trim();
      await navigator.clipboard.writeText(plainText);
      toast.success('Note copied');
      setMenuOpen(false);
    } catch (error) {
      console.error('Copy failed', error);
      toast.error('Unable to copy note');
    }
  };

  const handleExportPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4', compress: true });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 24;
      const marginY = 24;
      const maxWidth = pageWidth - marginX * 2;
      let cursorY = marginY;

      const writeText = (text: string, size: number, bold = false) => {
        if (!text.trim()) return;
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);

        const lines = doc.splitTextToSize(text, maxWidth) as string[];
        for (const line of lines) {
          if (cursorY > pageHeight - marginY) {
            doc.addPage();
            cursorY = marginY;
          }
          doc.text(line, marginX, cursorY);
          cursorY += size + 5;
        }
      };

      writeText(title.trim() || 'Untitled note', 18, true);
      cursorY += 4;

      let exportLines: ExportLine[] = [];
      let parseFailed = false;
      try {
        exportLines = buildExportLines(content);
      } catch (error) {
        console.error('Block parse failed during export', error);
        parseFailed = true;
        exportLines = [];
      }

      if (!parseFailed && exportLines.length === 0) {
        const fallback = extractPlainText(content);
        if (fallback) {
          exportLines = [{ text: fallback, variant: 'body' }];
        }
      }

      for (const line of exportLines) {
        writeText(line.text, line.variant === 'heading' ? 14 : 12, line.variant === 'heading');
      }

      doc.save(`Note-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF exported');
      setMenuOpen(false);
    } catch (error) {
      console.error('Export failed', error);
      toast.error('Unable to export note');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div 
        className={`fixed inset-0 z-40 bg-black/40 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
        onClick={onClose} 
      />

      <aside 
        className={`fixed left-0 top-0 z-50 flex h-[100dvh] w-full max-w-md flex-col bg-card transition-all duration-300 ease-in-out md:static md:z-auto md:order-first md:h-[calc(100%-3.5rem)] md:max-w-none md:flex-shrink-0 origin-left ${
          isOpen 
            ? 'translate-x-0 border-r border-border md:w-96 opacity-100 pointer-events-auto shadow-xl md:shadow-none' 
            : '-translate-x-full border-r-0 border-transparent md:translate-x-0 md:w-0 opacity-0 pointer-events-none overflow-hidden'
        }`}
      >
        <div className="relative flex items-center gap-2 border-b border-border px-4 py-3 md:min-w-[384px] w-full">
          <button 
            onClick={onClose} 
            className="md:hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Close notes"
          >
            <X className="h-4 w-4" />
          </button>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/70"
          />

          {isAutosaving ? (
            <div className="flex items-center justify-center text-muted-foreground" title="Autosaving">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : null}

          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="More options"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-md border border-border bg-card p-1 shadow-xl">
                <button
                  onClick={handleJumpToSource}
                  disabled={!latestSource || !onJumpToSource}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  Jump to source
                </button>
                <button
                  onClick={() => void handleCopy()}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy note
                </button>
                <button
                  onClick={() => void handleExportPdf()}
                  disabled={isExporting}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download as PDF
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-44 md:min-w-[384px] w-full">
          <div className="h-full">
            <RichNoteEditor
              key={editorKey}
              initialContent={content}
              onChange={setContent}
              compact={false}
              placeholder="Start writing your notes for this document..."
              editable
            />
          </div>
        </div>
      </aside>
    </>
  );
}
