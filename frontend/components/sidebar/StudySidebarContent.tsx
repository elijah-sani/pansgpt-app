import { BookOpen, Brain, MessageSquare } from 'lucide-react';
import { SidebarLink } from './SidebarPrimitives';
import { SidebarNotesSection, type SidebarNoteItem } from './SidebarNotesSection';

type StudySidebarContentProps = {
  isIconOnly: boolean;
  notes: SidebarNoteItem[];
  pathname: string;
  routerPush: (path: string) => void;
  totalNotes: number;
};

export function StudySidebarContent({
  isIconOnly,
  notes,
  pathname,
  routerPush,
  totalNotes,
}: StudySidebarContentProps) {
  return (
    <>
      <nav className={isIconOnly ? 'flex flex-col items-center py-1 gap-0.5' : 'px-2 space-y-0.5'}>
        <SidebarLink icon={MessageSquare} label="Chat" onClick={() => routerPush('/main')} isIconOnly={isIconOnly} />
        <SidebarLink icon={BookOpen} label="All Courses" onClick={() => routerPush('/reader')} active={pathname === '/reader'} isIconOnly={isIconOnly} />
        <SidebarLink icon={Brain} label="Quiz" onClick={() => routerPush('/quiz')} isIconOnly={isIconOnly} />
        {/* COMMENTED OUT: Notes Feature
        {isIconOnly ? (
          <SidebarNotesSection isIconOnly notes={notes} totalNotes={totalNotes} routerPush={routerPush} />
        ) : null}
        */}
      </nav>
      {/* COMMENTED OUT: Notes Feature
      {!isIconOnly ? (
        <SidebarNotesSection isIconOnly={false} notes={notes} totalNotes={totalNotes} routerPush={routerPush} />
      ) : null}
      */}
    </>
  );
}
