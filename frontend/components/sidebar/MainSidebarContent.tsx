import { useState } from 'react';
import { BookOpen, CalendarDays, Loader2, MessageSquare, MoreVertical, Pencil, Search, SquarePen, Trash2, Brain, NotepadText, ChevronRight, Plus } from 'lucide-react';
import { SidebarLink } from './SidebarPrimitives';
import { SidebarConversationList } from './SidebarConversationList';

type ChatSession = {
  id: string;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type QuickNote = {
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
  quickNotes?: QuickNote[];
  onOpenQuickNote?: () => void;
};

function getChatDateGroup(timestamp?: string | null) {
  if (!timestamp) return 'Older';

  const created = new Date(timestamp);
  if (Number.isNaN(created.getTime())) return 'Older';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfCreated = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime();
  const dayDiff = Math.floor((startOfToday - startOfCreated) / 86400000);

  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff <= 7) return 'Previous 7 days';
  if (dayDiff <= 30) return 'Previous 30 days';
  return created.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function groupChatSessionsByDate(sessions: ChatSession[]) {
  const groups: Array<{ label: string; sessions: ChatSession[] }> = [];
  const groupMap = new Map<string, ChatSession[]>();

  sessions.forEach((session) => {
    const label = getChatDateGroup(session.updated_at || session.created_at);
    const group = groupMap.get(label) || [];
    group.push(session);
    if (!groupMap.has(label)) {
      groupMap.set(label, group);
      groups.push({ label, sessions: group });
    }
  });

  return groups;
}

function ChatHistoryRow({
  activeSessionId,
  chat,
  handleLoadSession,
  onDeleteRequest,
  onRenameRequest,
  openMenuId,
  setOpenMenuId,
}: {
  activeSessionId: string | null;
  chat: ChatSession;
  handleLoadSession: (id: string) => void;
  onDeleteRequest?: (id: string) => void;
  onRenameRequest?: (id: string, title: string) => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
}) {
  return (
    <div
      className={`group relative flex items-center gap-2 rounded-[10px] py-1 pl-1 pr-1 text-[14px] font-medium transition-all cursor-pointer ${
        activeSessionId === chat.id
          ? 'bg-muted/50 text-foreground'
          : 'text-foreground hover:bg-muted/30'
      }`}
      onClick={() => handleLoadSession(chat.id)}
    >
      <span className="truncate flex-1">{chat.title}</span>
      <button
        onClick={(event) => {
          event.stopPropagation();
          setOpenMenuId(openMenuId === chat.id ? null : chat.id);
        }}
        className={`rounded p-1 transition-all ${
          openMenuId === chat.id ? 'bg-muted opacity-100' : 'opacity-100 hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100'
        }`}
      >
        <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {openMenuId === chat.id && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-border bg-card py-1 shadow-sm animate-in fade-in zoom-in-95 duration-150"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              onRenameRequest?.(chat.id, chat.title);
              setOpenMenuId(null);
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-foreground transition-all hover:bg-accent"
          >
            <Pencil className="w-4 h-4 text-muted-foreground" /> Rename
          </button>
          <button
            onClick={() => {
              onDeleteRequest?.(chat.id);
              setOpenMenuId(null);
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-destructive-foreground transition-all hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

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
  quickNotes = [],
  onOpenQuickNote = () => {},
}: MainSidebarContentProps) {
  const [isDateGroupingEnabled, setIsDateGroupingEnabled] = useState(false);

  return (
    <>
      <nav className={isIconOnly ? 'flex flex-col items-center py-1 gap-0.5' : 'px-2 space-y-0.5'}>
        <SidebarLink icon={SquarePen} label="New Chat" onClick={handleNewChat} isIconOnly={isIconOnly} />
        <SidebarLink icon={BookOpen} label="Study" onClick={() => routerPush('/reader')} isIconOnly={isIconOnly} />
        <SidebarLink icon={Brain} label="Quiz" onClick={() => routerPush('/quiz')} isIconOnly={isIconOnly} />
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
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsDateGroupingEnabled((previous) => !previous)}
                  aria-pressed={isDateGroupingEnabled}
                  title={isDateGroupingEnabled ? 'Disable date grouping' : 'Enable date grouping'}
                  className={`rounded-md p-1.5 transition-colors ${
                    isDateGroupingEnabled ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <CalendarDays size={14} />
                </button>
                {onSearchOpen && (
                  <button onClick={onSearchOpen} className="p-1.5 text-foreground hover:bg-muted rounded-md transition-colors">
                    <Search size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-2">
              <SidebarConversationList
                activeSessionId={activeSessionId}
                emptyText="No chats yet"
                handleLoadSession={handleLoadSession}
                isDateGroupingEnabled={isDateGroupingEnabled}
                isLoadingHistory={isLoadingHistory}
                loadingText="Loading..."
                onDeleteRequest={onDeleteRequest}
                onRenameRequest={onRenameRequest}
                openMenuId={openMenuId}
                sessions={sessions}
                setOpenMenuId={setOpenMenuId}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
