import { BookOpen, Brain, Loader2, MessageSquare, Plus, SlidersHorizontal, NotepadText, ChevronRight } from 'lucide-react';
import { SidebarLink, scoreColor } from './SidebarPrimitives';
import type { QuizHistoryItem } from './types';

type QuizSidebarContentProps = {
  hasActiveFilters: boolean;
  isIconOnly: boolean;
  pathname: string;
  quickNotes?: Array<{ id: string; title: string }>;
  quizLoading: boolean;
  quizResults: QuizHistoryItem[];
  routerPush: (path: string) => void;
  showFilters: () => void;
  onOpenQuickNote: () => void;
};

export function QuizSidebarContent({
  hasActiveFilters,
  isIconOnly,
  pathname,
  quickNotes = [],
  quizLoading,
  quizResults,
  routerPush,
  showFilters,
  onOpenQuickNote,
}: QuizSidebarContentProps) {
  return (
    <>
      <nav className={isIconOnly ? 'flex flex-col items-center py-1 gap-0.5' : 'px-2 space-y-0.5'}>
        <SidebarLink icon={MessageSquare} label="Chat" onClick={() => routerPush('/main')} isIconOnly={isIconOnly} />
        <SidebarLink icon={BookOpen} label="Study" onClick={() => routerPush('/reader')} isIconOnly={isIconOnly} />
        <SidebarLink icon={Plus} label="New Quiz" onClick={() => routerPush('/quiz')} active={pathname === '/quiz'} isIconOnly={isIconOnly} />
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
          <div className="flex flex-col flex-1 overflow-hidden pt-2 pb-2">
            <div className="flex items-center justify-between px-6 pt-2 pb-3 shrink-0">
              <h4 className="text-xs font-bold text-foreground/70 tracking-wider uppercase">History</h4>
              <button
                onClick={showFilters}
                title="Filter quiz history"
                className={`p-1.5 rounded-md transition-colors relative ${
                  hasActiveFilters ? 'text-primary bg-primary/10 hover:bg-primary/20' : 'text-foreground hover:bg-muted'
                }`}
              >
                <SlidersHorizontal size={14} />
                {hasActiveFilters && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full" />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-2">
              {quizLoading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                </div>
              ) : quizResults.length === 0 ? (
                <p className="text-sm text-muted-foreground px-3 py-3 italic">No quizzes yet</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {quizResults.map((item) => {
                    if (!item.result) {
                      return null;
                    }
                    const percentage = item.result.percentage;
                    const date = item.result.created_at || item.result.completed_at;
                    return (
                      <button
                        key={item.result.id}
                        onClick={() => routerPush(`/quiz/${item.id}/results?resultId=${item.result.id}`)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-foreground truncate leading-tight flex-1">
                            {item.title}
                          </span>
                          <span className={`text-xs font-bold shrink-0 ${scoreColor(percentage)}`}>
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-muted-foreground font-medium bg-muted/60 px-1.5 py-0.5 rounded">
                            {item.course_code}
                          </span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground">Lvl {item.level}</span>
                          {date && (
                            <>
                              <span className="text-[10px] text-muted-foreground">·</span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
