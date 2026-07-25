// [DESKTOP UI]
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Bell, History, MessageSquare, Moon, PanelLeft, Search, SquarePen, Sun, Trash2, User, X } from 'lucide-react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { usePathname, useRouter } from 'next/navigation';
import { useChatSession } from '@/lib/ChatSessionContext';
import { DocumentTabStrip } from '@/components/desktop/DocumentTabStrip'; // [DESKTOP UI]
import type { MainUser } from '@/components/main/types';

type SessionSummary = {
  id: string;
  title?: string | null;
};

type MainHeaderProps = {
  activeSessionId?: string | null;
  desktopOnly?: boolean;
  mobileOnly?: boolean;
  isProfileOpen?: boolean;
  onNewChat?: () => void;
  onOpenProfile?: () => void;
  onOpenSidebar?: () => void;
  onSearchOpen?: () => void;
  sessions?: SessionSummary[];
  user?: Exclude<MainUser, null> | null;
};

export function DesktopMainHeader({
  activeSessionId,
  desktopOnly = false,
  mobileOnly = false,
  isProfileOpen,
  onNewChat,
  onOpenProfile,
  onOpenSidebar,
  onSearchOpen,
  sessions = [],
  user,
}: MainHeaderProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  let chatSession: ReturnType<typeof useChatSession> | null = null;
  try {
    chatSession = useChatSession();
  } catch (e) {
    // Safe fallback if used outside context provider
  }

  const currentSessions = sessions.length > 0 ? sessions : (chatSession?.sessions || []);
  const currentActiveId = activeSessionId ?? chatSession?.activeSessionId;

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  // Close history pop-up on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setIsHistoryOpen(false);
      }
    };
    if (isHistoryOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHistoryOpen]);

  const handleSelectSession = (sessionId: string) => {
    if (chatSession?.setActiveSessionId) {
      chatSession.setActiveSessionId(sessionId);
    }
    setIsHistoryOpen(false);
    if (pathname !== '/main') {
      router.push('/main');
    }
  };

  const handleNewChat = () => {
    if (onNewChat) {
      onNewChat();
    } else if (chatSession?.setActiveSessionId) {
      chatSession.setActiveSessionId(null);
    }
    setIsHistoryOpen(false);
    if (pathname !== '/main') {
      router.push('/main');
    }
  };

  const isMainPage = pathname === '/main';
  const isChatActive = isMainPage && Boolean(currentActiveId);

  return (
    <>
      {/* ========================================================================= */}
      {/* DESKTOP GLOBAL TOP HEADER (Full Width, bg-card matching AppSidebar)       */}
      {/* ========================================================================= */}
      {!mobileOnly && (
        <header className="hidden md:flex h-11 w-full shrink-0 items-center justify-between bg-card px-4 z-30 select-none border-b border-border/40 gap-3">
          {/* Left: Brand Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            {onOpenSidebar && (
              <button
                type="button"
                onClick={onOpenSidebar}
                title="Toggle Sidebar"
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-md transition-colors shrink-0"
              >
                <PanelLeft size={16} />
              </button>
            )}

            <span className="text-base font-normal text-foreground tracking-wide shrink-0 hidden sm:inline" style={{ fontFamily: "'Albert Sans', sans-serif" }}>
              PansGPT
            </span>
          </div>

          {/* Center: History Button (Left), Search Bar (Center), New Chat Button (Right) */}
          <div className="flex-1 max-w-2xl mx-4 flex items-center gap-2.5">
            {/* HISTORY BUTTON & POP-UP BAR (ONLY WHEN CHAT IS ACTIVE IN MAIN) */}
            {isChatActive && (
              <div className="relative shrink-0" ref={historyRef}>
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen((prev) => !prev)}
                  title="Past Conversations"
                  className={`w-10 h-10 rounded-[5px] transition-all flex items-center justify-center select-none shrink-0 ${
                    isHistoryOpen || currentActiveId
                      ? 'bg-accent text-foreground font-medium shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <History size={18} className="shrink-0" />
                </button>

                {/* POP-UP BAR WITH PAST CONVERSATIONS */}
                {isHistoryOpen && (
                  <div className="absolute left-0 top-12 z-50 w-80 sm:w-96 rounded-[8px] border border-border/80 bg-card shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                      <div className="flex items-center gap-2">
                        <History size={16} className="text-primary" />
                        <span className="text-sm font-medium text-foreground">Past Conversations</span>
                      </div>
                      <button
                        onClick={() => setIsHistoryOpen(false)}
                        className="p-1 text-muted-foreground hover:text-foreground rounded-[5px] hover:bg-accent transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Sessions List */}
                    <div className="mt-3 max-h-72 overflow-y-auto space-y-1 pr-1">
                      {currentSessions.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                          No past conversations yet
                        </div>
                      ) : (
                        currentSessions.map((session) => {
                          const isActive = session.id === currentActiveId;
                          return (
                            <div
                              key={`history-pop-${session.id}`}
                              onClick={() => handleSelectSession(session.id)}
                              className={`group flex items-center justify-between p-2.5 rounded-[5px] text-xs font-medium cursor-pointer transition-colors ${
                                isActive
                                  ? 'bg-accent text-foreground font-semibold'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <MessageSquare size={14} className={`shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                                <span className="truncate">{session.title || 'Untitled Conversation'}</span>
                              </div>
                              {chatSession?.deleteSession && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    chatSession.deleteSession(session.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive rounded transition-all"
                                  title="Delete chat"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {currentSessions.length} {currentSessions.length === 1 ? 'conversation' : 'conversations'}
                      </span>
                      <button
                        onClick={handleNewChat}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] bg-accent text-foreground hover:bg-accent/80 text-xs font-medium transition-colors"
                      >
                        <SquarePen size={14} />
                        <span>New Chat</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SEARCH BAR (CENTER) */}
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={onSearchOpen}
                className="w-full h-10 flex items-center gap-2.5 px-3.5 py-2 rounded-[5px] border border-border/80 bg-background/60 hover:bg-background text-muted-foreground hover:text-foreground text-xs transition-colors shadow-xs select-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Search size={16} className="shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left truncate">Search documents, topics, or chats...</span>
              </button>
            </div>

            {/* NEW CHAT BUTTON (ONLY WHEN CHAT IS ACTIVE IN MAIN) */}
            {isChatActive && (
              <button
                type="button"
                onClick={handleNewChat}
                title="New Chat"
                className="w-10 h-10 rounded-[5px] transition-all flex items-center justify-center select-none shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <SquarePen size={18} className="shrink-0" />
              </button>
            )}
          </div>

          {/* Right: Actions (Notifications, Theme, Profile) */}
          <div className="flex items-center gap-2 min-w-[180px] justify-end">
            {/* Notification Bell */}
            <button
              type="button"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/70 rounded-lg transition-colors relative"
              title="Notifications"
            >
              <Bell size={18} />
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/70 rounded-lg transition-colors"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* User Profile Avatar */}
            {user && !isProfileOpen && (
              <button
                type="button"
                onClick={onOpenProfile}
                className="ml-1 w-8 h-8 rounded-full ring-1 ring-primary/40 hover:ring-primary flex items-center justify-center overflow-hidden bg-muted shrink-0 transition-all relative"
                title="Profile & Account"
              >
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt="Avatar"
                    fill
                    sizes="32px"
                    unoptimized={typeof user.avatarUrl === "string" && user.avatarUrl.includes("dicebear.com")}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={18} className="text-muted-foreground" />
                )}
              </button>
            )}
          </div>
        </header>
      )}

      {/* ========================================================================= */}
      {/* MOBILE TOP HEADER (Preserved for mobile viewports with History & New Chat)  */}
      {/* ========================================================================= */}
      {!desktopOnly && (
        <div className="md:hidden pointer-events-none absolute left-0 right-0 top-0 z-20 h-28 bg-gradient-to-b from-background via-background/90 to-transparent">
          <div className="pointer-events-auto flex h-[73px] items-center gap-3 px-4">
            <button
              onClick={onOpenSidebar}
              className="p-2 -ml-1 text-foreground hover:bg-accent rounded-lg transition-colors"
              title="Open sidebar"
            >
              <PanelLeft size={20} />
            </button>
            <span className="text-base font-medium text-foreground" style={{ fontFamily: "'Albert Sans', sans-serif" }}>
              PansGPT
            </span>
            <div className="flex-1" />

            {/* Mobile History & New Chat Toggles (ONLY WHEN CHAT IS ACTIVE IN MAIN) */}
            {isChatActive && (
              <>
                <div className="relative pointer-events-auto" ref={historyRef}>
                  <button
                    onClick={() => setIsHistoryOpen((prev) => !prev)}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                    title="Past conversations"
                  >
                    <History size={18} />
                  </button>

                  {isHistoryOpen && (
                    <div className="absolute right-0 top-10 z-50 w-72 rounded-[8px] border border-border/80 bg-card shadow-2xl p-4 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-border/40">
                        <span className="text-xs font-bold text-foreground">Past Conversations</span>
                        <button onClick={() => setIsHistoryOpen(false)} className="p-1 text-muted-foreground">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="mt-2 max-h-60 overflow-y-auto space-y-1">
                        {currentSessions.length === 0 ? (
                          <div className="py-4 text-center text-xs text-muted-foreground">No conversations</div>
                        ) : (
                          currentSessions.map((session) => (
                            <div
                              key={`mob-hist-${session.id}`}
                              onClick={() => handleSelectSession(session.id)}
                              className={`p-2 rounded-xl text-xs flex items-center justify-between ${
                                session.id === currentActiveId ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-accent'
                              }`}
                            >
                              <span className="truncate">{session.title || 'Untitled Conversation'}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleNewChat}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  title="New chat"
                >
                  <SquarePen size={20} />
                </button>
              </>
            )}

            {user && !isProfileOpen && (
              <button
                onClick={onOpenProfile}
                className="w-7 h-7 rounded-full ring-1 ring-primary flex items-center justify-center overflow-hidden bg-muted shrink-0 transition-all relative"
                title="Profile"
              >
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt="Avatar"
                    fill
                    sizes="28px"
                    unoptimized={typeof user.avatarUrl === "string" && user.avatarUrl.includes("dicebear.com")}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={18} className="text-muted-foreground" />
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
