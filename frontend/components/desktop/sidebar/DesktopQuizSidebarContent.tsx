// [DESKTOP UI]
import { Home, HelpCircle, Filter, MessageSquare } from 'lucide-react';
import { scoreColor, SidebarLink } from './DesktopSidebarPrimitives';

type QuizHistoryItem = {
  id: string;
  title?: string;
  course_code?: string;
  result: {
    id: string;
    percentage: number;
  };
};

type QuizSidebarContentProps = {
  hasActiveFilters?: boolean;
  isIconOnly: boolean;
  notes?: any[];
  pathname: string;
  quizLoading?: boolean;
  quizResults?: QuizHistoryItem[];
  routerPush: (path: string) => void;
  showFilters?: () => void;
  totalNotes?: number;
};

export function DesktopQuizSidebarContent({
  hasActiveFilters = false,
  isIconOnly,
  pathname,
  quizLoading = false,
  quizResults = [],
  routerPush,
  showFilters,
}: QuizSidebarContentProps) {
  return (
    <>
      <nav className="flex flex-col items-center py-1 gap-1">
        <SidebarLink icon={Home} label="Home" onClick={() => routerPush('/study')} active={pathname.startsWith('/reader') || pathname.startsWith('/study')} isIconOnly={true} />
        <SidebarLink icon={MessageSquare} label="AI Chat" onClick={() => routerPush('/main')} active={pathname === '/main'} isIconOnly={true} />
        <SidebarLink icon={HelpCircle} label="Quiz" onClick={() => routerPush('/quiz')} active={pathname === '/quiz' || pathname.startsWith('/quiz/')} isIconOnly={true} />
      </nav>

      {!isIconOnly ? (
        <>
          {(quizLoading || quizResults.length > 0 || showFilters) ? (
            <section className="px-2 pt-3">
              <div className="mb-1 flex min-h-8 items-center justify-between px-3">
                <span className="text-xs font-medium text-muted-foreground">Recent quizzes</span>
                {showFilters ? (
                  <button
                    type="button"
                    onClick={showFilters}
                    className={`rounded-md p-1 transition-colors hover:bg-muted/40 ${
                      hasActiveFilters ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    aria-label="Filter quizzes"
                    title="Filter quizzes"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="space-y-0.5">
                {quizLoading ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Loading quizzes...</p>
                ) : quizResults.length > 0 ? (
                  quizResults.slice(0, 5).map((quiz) => (
                    <button
                      key={quiz.id}
                      type="button"
                      onClick={() => routerPush(`/quiz/${quiz.id}/results?resultId=${quiz.result.id}`)}
                      className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40 active:scale-[0.98]"
                    >
                      <span className="min-w-0 flex-1 truncate text-foreground/90">{quiz.title || quiz.course_code}</span>
                      <span className={`shrink-0 text-xs font-semibold ${scoreColor(quiz.result.percentage)}`}>
                        {Math.round(quiz.result.percentage)}%
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No quizzes yet</p>
                )}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
