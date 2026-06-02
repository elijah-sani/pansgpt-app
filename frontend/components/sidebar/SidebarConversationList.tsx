import { Loader2, MoreVertical, Pencil, Trash2 } from 'lucide-react';

export type SidebarConversation = {
  id: string;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type SidebarConversationListProps = {
  activeSessionId: string | null;
  emptyText?: string;
  handleLoadSession: (id: string) => void;
  isDateGroupingEnabled: boolean;
  isLoadingHistory: boolean;
  loadingText?: string;
  onDeleteRequest?: (id: string) => void;
  onRenameRequest?: (id: string, title: string) => void;
  openMenuId: string | null;
  sessions: SidebarConversation[];
  setOpenMenuId: (id: string | null) => void;
};

function getConversationDateGroup(timestamp?: string | null) {
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

function groupConversationsByDate(sessions: SidebarConversation[]) {
  const groups: Array<{ label: string; sessions: SidebarConversation[] }> = [];
  const groupMap = new Map<string, SidebarConversation[]>();

  sessions.forEach((session) => {
    const label = getConversationDateGroup(session.updated_at || session.created_at);
    const group = groupMap.get(label) || [];
    group.push(session);
    if (!groupMap.has(label)) {
      groupMap.set(label, group);
      groups.push({ label, sessions: group });
    }
  });

  return groups;
}

export function SidebarConversationList({
  activeSessionId,
  emptyText = 'No chats yet',
  handleLoadSession,
  isDateGroupingEnabled,
  isLoadingHistory,
  loadingText = 'Loading chats...',
  onDeleteRequest,
  onRenameRequest,
  openMenuId,
  sessions,
  setOpenMenuId,
}: SidebarConversationListProps) {
  if (isLoadingHistory) {
    return (
      <div className="flex min-h-[38px] items-center gap-3 rounded-[10px] text-sm font-medium text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{loadingText}</span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return <p className="py-3 text-sm font-medium text-muted-foreground">{emptyText}</p>;
  }

  const renderRow = (chat: SidebarConversation) => (
    <div
      key={chat.id}
      data-mobile-chat-menu
      onClick={() => handleLoadSession(chat.id)}
      className={`group relative flex min-h-[38px] w-full cursor-pointer items-center gap-2 rounded-[10px] py-1 pl-1 pr-1 text-left text-[14px] font-medium text-foreground transition-all active:scale-[0.98] active:bg-muted ${
        activeSessionId === chat.id ? 'bg-muted/50' : 'hover:bg-muted/30'
      } ${
        openMenuId === chat.id ? 'z-[210]' : 'z-0'
      }`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <span className="line-clamp-1 flex-1">{chat.title}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpenMenuId(openMenuId === chat.id ? null : chat.id);
        }}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all active:scale-95 active:bg-muted ${
          openMenuId === chat.id ? 'bg-muted opacity-100' : 'opacity-100 hover:bg-muted/70 sm:opacity-0 sm:group-hover:opacity-100'
        }`}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        aria-label="Chat options"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {openMenuId === chat.id && (
        <div
          className="pointer-events-auto absolute right-1 top-9 z-[240] w-40 rounded-xl border border-border bg-card py-1 shadow-xl"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              onRenameRequest?.(chat.id, chat.title);
              setOpenMenuId(null);
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent active:bg-muted"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
            <span>Rename</span>
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              onDeleteRequest?.(chat.id);
              setOpenMenuId(null);
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-destructive-foreground transition-colors hover:bg-destructive/10 active:bg-destructive/10"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );

  if (!isDateGroupingEnabled) {
    return <div className="space-y-0">{sessions.map(renderRow)}</div>;
  }

  return (
    <div className="space-y-4">
      {groupConversationsByDate(sessions).map((group, groupIndex) => (
        <div key={group.label} className={groupIndex === 0 ? '' : 'pt-1'}>
          <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            {group.label}
          </h3>
          <div className="space-y-0">{group.sessions.map(renderRow)}</div>
        </div>
      ))}
    </div>
  );
}
