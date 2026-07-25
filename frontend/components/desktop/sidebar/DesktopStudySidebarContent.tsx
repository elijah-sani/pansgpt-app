// [DESKTOP UI]
import { Home, HelpCircle, MessageSquare } from 'lucide-react';
import { SidebarLink } from './DesktopSidebarPrimitives';

type StudySidebarContentProps = {
  isIconOnly: boolean;
  notes?: any[];
  pathname: string;
  routerPush: (path: string) => void;
  totalNotes?: number;
};

export function DesktopStudySidebarContent({
  pathname,
  routerPush,
}: StudySidebarContentProps) {
  return (
    <nav className="flex flex-col items-center py-1 gap-1">
      <SidebarLink icon={Home} label="Home" onClick={() => routerPush('/study')} active={pathname.startsWith('/reader') || pathname.startsWith('/study')} isIconOnly={true} />
      <SidebarLink icon={MessageSquare} label="AI Chat" onClick={() => routerPush('/main')} active={pathname === '/main'} isIconOnly={true} />
      <SidebarLink icon={HelpCircle} label="Quiz" onClick={() => routerPush('/quiz')} active={pathname.startsWith('/quiz')} isIconOnly={true} />
    </nav>
  );
}
