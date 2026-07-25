// [DESKTOP UI]
import { useState } from 'react';
import { Home, HelpCircle, MessageSquare, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { SidebarLink } from './DesktopSidebarPrimitives';

import { type SidebarNoteItem } from '@/components/sidebar/SidebarNotesSection';

type ChatSession = {
  id: string;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
};

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

export function DesktopMainSidebarContent({
  handleNewChat,
  routerPush,
}: MainSidebarContentProps) {
  return (
    <nav className="flex flex-col items-center py-1 gap-1">
      <SidebarLink icon={MessageSquare} label="AI Chat" onClick={() => { handleNewChat(); routerPush('/main'); }} active={true} isIconOnly={true} />
      <SidebarLink icon={Home} label="Home" onClick={() => routerPush('/study')} isIconOnly={true} />
      <SidebarLink icon={HelpCircle} label="Quiz" onClick={() => routerPush('/quiz')} isIconOnly={true} />
    </nav>
  );
}
