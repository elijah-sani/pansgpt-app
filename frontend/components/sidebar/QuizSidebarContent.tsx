import { BookOpen, Brain, MessageSquare } from 'lucide-react';
import { SidebarLink } from './SidebarPrimitives';
import { SidebarNotesSection, type SidebarNoteItem } from './SidebarNotesSection';

type QuizSidebarContentProps = {
  isIconOnly: boolean;
  notes: SidebarNoteItem[];
  pathname: string;
  routerPush: (path: string) => void;
  totalNotes: number;
};

export function QuizSidebarContent({
  isIconOnly,
  notes,
  pathname,
  routerPush,
  totalNotes,
}: QuizSidebarContentProps) {
  return (
    <>
      <nav className={isIconOnly ? 'flex flex-col items-center py-1 gap-0.5' : 'px-2 space-y-0.5'}>
        <SidebarLink icon={MessageSquare} label="Chat" onClick={() => routerPush('/main')} isIconOnly={isIconOnly} />
        <SidebarLink icon={BookOpen} label="Study" onClick={() => routerPush('/reader')} isIconOnly={isIconOnly} />
        <SidebarLink icon={Brain} label="Quiz" onClick={() => routerPush('/quiz')} active={pathname === '/quiz' || pathname.startsWith('/quiz/')} isIconOnly={isIconOnly} />
        {isIconOnly ? (
          <SidebarNotesSection isIconOnly notes={notes} totalNotes={totalNotes} routerPush={routerPush} />
        ) : null}
      </nav>

      {!isIconOnly ? (
        <SidebarNotesSection isIconOnly={false} notes={notes} totalNotes={totalNotes} routerPush={routerPush} />
      ) : null}
    </>
  );
}
