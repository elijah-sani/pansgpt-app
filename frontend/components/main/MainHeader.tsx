import { PanelLeft, SquarePen, User } from 'lucide-react';
import type { MainUser } from './types';

type SessionSummary = {
  id: string;
  title?: string | null;
};

type MainHeaderProps = {
  activeSessionId: string | null;
  isProfileOpen: boolean;
  onNewChat: () => void;
  onOpenProfile: () => void;
  onOpenSidebar: () => void;
  sessions: SessionSummary[];
  user: Exclude<MainUser, null>;
};

export function MainHeader({
  activeSessionId,
  isProfileOpen,
  onNewChat,
  onOpenProfile,
  onOpenSidebar,
  sessions,
  user,
}: MainHeaderProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-4 h-[73px] bg-background">
      <button
        onClick={onOpenSidebar}
        className="md:hidden p-2 -ml-1 text-foreground hover:bg-accent rounded-lg transition-colors"
        title="Open sidebar"
      >
        <PanelLeft size={20} />
      </button>
      <span className="text-base font-medium text-foreground" style={{ fontFamily: "'Albert Sans', sans-serif" }}>
        PansGPT
      </span>
      <div className="flex-1" />
      {activeSessionId && (
        <span className="hidden sm:block absolute left-1/2 -translate-x-1/2 text-sm font-bold text-foreground truncate max-w-[40%] pointer-events-none">
          {sessions.find((session) => session.id === activeSessionId)?.title || ''}
        </span>
      )}
      <button
        onClick={onNewChat}
        className="sm:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
        title="New chat"
      >
        <SquarePen size={20} />
      </button>
      {!isProfileOpen && (
        <button
          onClick={onOpenProfile}
          className="w-7 h-7 rounded-full ring-1 ring-primary flex items-center justify-center overflow-hidden bg-muted flex-shrink-0 transition-all"
          title="Profile"
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User size={18} className="text-muted-foreground" />
          )}
        </button>
      )}
    </div>
  );
}
