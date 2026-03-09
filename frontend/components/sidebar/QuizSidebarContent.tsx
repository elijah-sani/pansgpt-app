import { BookOpen, Brain, Loader2, MessageSquare, Plus, SlidersHorizontal } from 'lucide-react';
import { SidebarLink, scoreColor } from './SidebarPrimitives';
import type { QuizHistoryItem } from './types';

type QuizSidebarContentProps = {
  hasActiveFilters: boolean;
  isIconOnly: boolean;
  pathname: string;
  quizLoading: boolean;
  quizResults: QuizHistoryItem[];
  routerPush: (path: string) => void;
  showFilters: () => void;
};

export function QuizSidebarContent({
  hasActiveFilters,
  isIconOnly,
  pathname,
  quizLoading,
  quizResults,
  routerPush,
  showFilters,
}: QuizSidebarContentProps) {
  return (
    <>
      <nav className={isIconOnly ? 'flex flex-col items-center py-1 gap-0.5' : 'px-2 space-y-0.5'}>
        <SidebarLink icon={MessageSquare} label="Chat" onClick={() => routerPush('/main')} isIconOnly={isIconOnly} />
        <SidebarLink icon={BookOpen} label="Study" onClick={() => routerPush('/reader')} isIconOnly={isIconOnly} />
        <SidebarLink icon={Plus} label="New Quiz" onClick={() => routerPush('/quiz')} active={pathname === '/quiz'} isIconOnly={isIconOnly} />
      </nav>

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
