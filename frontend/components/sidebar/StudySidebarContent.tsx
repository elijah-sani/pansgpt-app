import { BookOpen, Brain, MessageSquare } from 'lucide-react';
import { SidebarLink } from './SidebarPrimitives';

type StudySidebarContentProps = {
  isIconOnly: boolean;
  pathname: string;
  routerPush: (path: string) => void;
};

export function StudySidebarContent({
  isIconOnly,
  pathname,
  routerPush,
}: StudySidebarContentProps) {
  return (
    <>
      <nav className={isIconOnly ? 'flex flex-col items-center py-1 gap-0.5' : 'px-2 space-y-0.5'}>
        <SidebarLink icon={MessageSquare} label="Chat" onClick={() => routerPush('/main')} isIconOnly={isIconOnly} />
        <SidebarLink icon={BookOpen} label="All Courses" onClick={() => routerPush('/reader')} active={pathname === '/reader'} isIconOnly={isIconOnly} />
        <SidebarLink icon={Brain} label="Quiz" onClick={() => routerPush('/quiz')} isIconOnly={isIconOnly} />
      </nav>
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
