import { Home, HelpCircle, MessageSquare } from 'lucide-react';
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
      <nav className="flex flex-col items-center py-1 gap-1">
        <SidebarLink icon={MessageSquare} label="AI Chat" onClick={() => routerPush('/main')} active={pathname === '/main'} isIconOnly={true} />
        <SidebarLink icon={Home} label="Home" onClick={() => routerPush('/reader')} active={pathname.startsWith('/reader')} isIconOnly={true} />
        <SidebarLink icon={HelpCircle} label="Quiz" onClick={() => routerPush('/quiz')} active={pathname.startsWith('/quiz')} isIconOnly={true} />
      </nav>
      {/* COMMENTED OUT: Notes Feature
      {!isIconOnly ? (
        <SidebarNotesSection isIconOnly={false} notes={notes} totalNotes={totalNotes} routerPush={routerPush} />
      ) : null}
      */}
    </>
  );
}
