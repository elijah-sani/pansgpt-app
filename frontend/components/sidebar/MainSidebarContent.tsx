import { useState } from 'react';
import { Home, HelpCircle, MessageSquare } from 'lucide-react';
import { SidebarLink } from './SidebarPrimitives';

type MainSidebarContentProps = {
  activeSessionId: string | null;
  handleLoadSession: (id: string) => void;
  handleNewChat: () => void;
  isIconOnly: boolean;
  isLoadingHistory: boolean;
  onDeleteRequest?: (id: string) => void;
  onRenameRequest?: (id: string, title: string) => void;
  openMenuId: string | null;
  routerPush: (path: string) => void;
  sessions: ChatSession[];
  setOpenMenuId: (id: string | null) => void;
  notes: SidebarNoteItem[];
  totalNotes: number;
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
  openMenuId,
  routerPush,
  sessions,
  setOpenMenuId,
  notes,
  totalNotes,
}: MainSidebarContentProps) {
  const [isDateGroupingEnabled, setIsDateGroupingEnabled] = useState(false);
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(true);

  return (
    <>
      <nav className="flex flex-col items-center py-1 gap-1">
        <SidebarLink icon={MessageSquare} label="AI Chat" onClick={() => { handleNewChat(); routerPush('/main'); }} active={true} isIconOnly={true} />
        <SidebarLink icon={Home} label="Home" onClick={() => routerPush('/reader')} isIconOnly={true} />
        <SidebarLink icon={HelpCircle} label="Quiz" onClick={() => routerPush('/quiz')} isIconOnly={true} />
      </nav>

      {/* COMMENTED OUT: Notes Feature
      {!isIconOnly ? (
        <SidebarNotesSection isIconOnly={false} notes={notes} totalNotes={totalNotes} routerPush={routerPush} />
      ) : null}
      */}
    </>
  );
}
