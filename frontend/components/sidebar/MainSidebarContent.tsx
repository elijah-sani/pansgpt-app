import { BookOpen, Loader2, MessageSquare, MoreVertical, Pencil, Search, SquarePen, Trash2, Brain } from 'lucide-react';
import { SidebarLink } from './SidebarPrimitives';

type ChatSession = {
  id: string;
  title: string;
};

type MainSidebarContentProps = {
  activeSessionId: string | null;
  handleLoadSession: (id: string) => void;
  handleNewChat: () => void;
  isIconOnly: boolean;
  isLoadingHistory: boolean;
  onDeleteRequest?: (id: string) => void;
  onRenameRequest?: (id: string, title: string) => void;
  onSearchOpen?: () => void;
  openMenuId: string | null;
  routerPush: (path: string) => void;
  sessions: ChatSession[];
  setOpenMenuId: (id: string | null) => void;
};

export function MainSidebarContent({
  activeSessionId,
  handleLoadSession,
  handleNewChat,
  isIconOnly,
  isLoadingHistory,
  onDeleteRequest,
  onRenameRequest,
  onSearchOpen,
  openMenuId,
  routerPush,
  sessions,
  setOpenMenuId,
}: MainSidebarContentProps) {
  return (
    <>
      <nav className={isIconOnly ? 'flex flex-col items-center py-1 gap-0.5' : 'px-2 space-y-0.5'}>
        <SidebarLink icon={SquarePen} label="New Chat" onClick={handleNewChat} isIconOnly={isIconOnly} />
        <SidebarLink icon={BookOpen} label="Study" onClick={() => routerPush('/reader')} isIconOnly={isIconOnly} />
        <SidebarLink icon={Brain} label="Quiz" onClick={() => routerPush('/quiz')} isIconOnly={isIconOnly} />
      </nav>

      {!isIconOnly && (
        <>
          <div className="px-5 pt-4"><div className="border-t border-border" /></div>
          <div className="flex flex-col flex-1 overflow-hidden pt-2 pb-2">
            <div className="flex items-center justify-between px-6 pt-2 pb-3 shrink-0">
              <h4 className="text-xs font-bold text-foreground/70 tracking-wider uppercase">History</h4>
              {onSearchOpen && (
                <button onClick={onSearchOpen} className="p-1.5 text-foreground hover:bg-muted rounded-md transition-colors">
                  <Search size={14} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-2">
              {isLoadingHistory ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground px-3 py-3 italic">No chats yet</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {sessions.map((chat) => (
                    <div
                      key={chat.id}
                      className={`group relative flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm font-medium transition-all ${
                        activeSessionId === chat.id
                          ? 'text-primary bg-primary/10 dark:text-foreground dark:bg-muted/30'
                          : 'text-foreground/80 hover:text-foreground hover:bg-muted/30'
                      }`}
                      onClick={() => handleLoadSession(chat.id)}
                    >
                      <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="truncate flex-1">{chat.title}</span>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuId(openMenuId === chat.id ? null : chat.id);
                        }}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all"
                      >
                        <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      {openMenuId === chat.id && (
                        <div
                          className="absolute right-0 top-full mt-1 z-50 w-40 bg-card border border-border rounded-xl shadow-xl py-1 animate-in fade-in zoom-in-95 duration-150"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              onRenameRequest?.(chat.id, chat.title);
                              setOpenMenuId(null);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-all"
                          >
                            <Pencil className="w-4 h-4 text-muted-foreground" /> Rename
                          </button>
                          <button
                            onClick={() => {
                              onDeleteRequest?.(chat.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-destructive-foreground hover:bg-destructive/10 transition-all"
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
