import { BookOpen, Brain, MessageSquare, NotepadText, ChevronRight, Plus } from 'lucide-react';
import { SidebarLink } from './SidebarPrimitives';

type StudySidebarContentProps = {
  isIconOnly: boolean;
  pathname: string;
  quickNotes?: Array<{ id: string; title: string }>;
  routerPush: (path: string) => void;
  onOpenQuickNote: () => void;
};

export function StudySidebarContent({
  isIconOnly,
  pathname,
  quickNotes = [],
  routerPush,
  onOpenQuickNote,
}: StudySidebarContentProps) {
  return (
    <>
      <nav className={isIconOnly ? 'flex flex-col items-center py-1 gap-0.5' : 'px-2 space-y-0.5'}>
        <SidebarLink icon={MessageSquare} label="Chat" onClick={() => routerPush('/main')} isIconOnly={isIconOnly} />
        <SidebarLink icon={BookOpen} label="All Courses" onClick={() => routerPush('/reader')} active={pathname === '/reader'} isIconOnly={isIconOnly} />
        <SidebarLink icon={Brain} label="Quiz" onClick={() => routerPush('/quiz')} isIconOnly={isIconOnly} />
        {quickNotes.length === 0 && (
          <SidebarLink icon={NotepadText} label="Notes" onClick={() => routerPush('/notes')} isIconOnly={isIconOnly} />
        )}
      </nav>
      {!isIconOnly && quickNotes.length > 0 && (
        <div className="px-2 pt-3 pb-1">
          <button
            onClick={() => routerPush('/notes')}
            className="mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted/40"
          >
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Notes</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>

          <div className="space-y-1 pl-4">
            {quickNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => routerPush(`/notes?note=${encodeURIComponent(note.id)}`)}
                className="group flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors text-foreground/90 hover:bg-muted/40"
              >
                <NotepadText className="w-4 h-4 shrink-0 text-foreground/65" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{note.title}</span>
              </button>
            ))}
          </div>

          <button
            onClick={onOpenQuickNote}
            className="mt-1 ml-4 flex w-[calc(100%-1rem)] items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium text-foreground/90 transition-colors hover:bg-muted/40"
          >
            <Plus className="h-4 w-4 shrink-0 text-foreground/70" />
            <span>Quick notes</span>
          </button>
        </div>
      )}
      {!isIconOnly && (
        <>
          <div className="px-5 pt-4"><div className="border-t border-border" /></div>
          <div className="px-6 pt-4">
            <p className="text-xs font-bold text-foreground/70 tracking-wider uppercase mb-2">Study Mode</p>
            <p className="text-xs text-muted-foreground">Select a course to browse lecture materials.</p>
          </div>
        </>
      )}
    </>
  );
}
