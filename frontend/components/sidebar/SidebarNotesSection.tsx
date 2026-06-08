import { useState } from 'react';
import { ChevronDown, FileText, MoreHorizontal, NotepadText, Plus } from 'lucide-react';
import { SidebarLink } from './SidebarPrimitives';

export type SidebarNoteItem = {
  id: string;
  title: string;
};

type SidebarNotesSectionProps = {
  isIconOnly: boolean;
  compact?: boolean;
  notes: SidebarNoteItem[];
  totalNotes: number;
  routerPush: (path: string) => void;
};

export function SidebarNotesSection({
  isIconOnly,
  compact = false,
  notes,
  totalNotes,
  routerPush,
}: SidebarNotesSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (isIconOnly) {
    return (
      <SidebarLink
        icon={NotepadText}
        label="Notes"
        onClick={() => routerPush('/notes')}
        isIconOnly
      />
    );
  }

  return (
    <section className={compact ? "pt-3 pb-1" : "px-2 pt-3 pb-1"}>
      <div className={compact ? "mb-1 flex min-h-8 items-center px-1" : "mb-1 flex min-h-8 items-center px-3"}>
        <span className="text-xs font-medium text-muted-foreground">Notes</span>
        <button
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          aria-expanded={isOpen}
          title={isOpen ? 'Collapse notes' : 'Expand notes'}
          className="ml-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
        </button>
      </div>

      {isOpen ? (
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => routerPush('/notes?new=1')}
            className={compact ? "flex min-h-9 w-full items-center gap-3 rounded-lg px-1 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/40 active:scale-[0.98]" : "flex min-h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/40 active:scale-[0.98]"}
          >
            <Plus className="h-[18px] w-[18px] shrink-0 text-foreground/80" />
            <span className="min-w-0 flex-1 truncate">New note</span>
          </button>

          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => routerPush(`/notes?note=${encodeURIComponent(note.id)}`)}
              className={compact ? "flex min-h-9 w-full items-center gap-3 rounded-lg px-1 text-left text-sm font-medium text-foreground/90 transition-colors hover:bg-muted/40 active:scale-[0.98]" : "flex min-h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-foreground/90 transition-colors hover:bg-muted/40 active:scale-[0.98]"}
            >
              <FileText className="h-[18px] w-[18px] shrink-0 text-foreground/70" />
              <span className="min-w-0 flex-1 truncate">{note.title}</span>
            </button>
          ))}

          {totalNotes > 2 ? (
            <button
              type="button"
              onClick={() => routerPush('/notes')}
              className={compact ? "flex min-h-9 w-full items-center gap-3 rounded-lg px-1 text-left text-sm font-medium text-foreground/90 transition-colors hover:bg-muted/40 active:scale-[0.98]" : "flex min-h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-foreground/90 transition-colors hover:bg-muted/40 active:scale-[0.98]"}
            >
              <MoreHorizontal className="h-[18px] w-[18px] shrink-0 text-foreground/70" />
              <span className="min-w-0 flex-1 truncate">All notes</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
