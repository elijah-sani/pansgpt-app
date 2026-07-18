'use client';

import React, { useEffect, useState } from 'react';
import ChatSkeleton from '@/components/ChatSkeleton';
import WelcomeSkeleton from '@/components/WelcomeSkeleton';

export default function MainLoading() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const activeSession = window.sessionStorage.getItem('pansgpt_active_session');
      setHasSession(!!activeSession);
    }
  }, []);

  return (
    <div className="h-full w-full relative flex flex-col bg-background text-foreground overflow-hidden animate-in fade-in duration-250">
      {/* Header Skeleton (Matches MainHeader layout) */}
      <div className="h-[73px] flex items-center px-4 shrink-0 bg-gradient-to-b from-background via-background/90 to-transparent">
        <div className="h-5 bg-accent/30 rounded-md w-24 animate-pulse"></div>
        <div className="flex-1" />
        <div className="w-7 h-7 rounded-full bg-accent/30 animate-pulse shrink-0"></div>
      </div>
      
      {/* Scrollable Message Area (Matches MainConversation scroll wrapper) */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-16 pb-4">
        {hasSession === null ? (
          <div className="h-full w-full" />
        ) : hasSession ? (
          <ChatSkeleton />
        ) : (
          <WelcomeSkeleton />
        )}
      </div>

      {hasSession === false && (
        <div className="sm:hidden w-full px-4 pb-6 shrink-0">
          <div className="relative flex flex-col bg-card rounded-[28px] border border-border/40 p-4 shadow-lg shadow-black/5 h-[128px] w-full animate-pulse">
            <div className="h-4 bg-accent/20 rounded-md w-1/3 mt-1" />
            <div className="flex items-center justify-between mt-auto">
              <div className="h-9 w-9 rounded-full bg-accent/15" />
              <div className="h-9 w-9 rounded-full bg-accent/15" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
