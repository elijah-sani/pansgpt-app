import ChatSkeleton from '@/components/ChatSkeleton';

export default function MainLoading() {
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
        <ChatSkeleton />
      </div>
    </div>
  );
}
