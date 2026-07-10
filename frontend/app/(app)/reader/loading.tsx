import React from 'react';
import { 
    Library, 
    PanelLeft, 
    RefreshCw, 
    List, 
    LayoutGrid, 
    Search,
    BookOpen,
    Clock
} from 'lucide-react';

export default function ReaderLoading() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground transition-colors duration-500">
      
      {/* 1. LEFT LOCAL SIDEBAR - DESKTOP ONLY */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-border/60 bg-card/35 backdrop-blur-md">
        {/* Title */}
        <div className="px-6 py-5 border-b border-border/40 flex items-center gap-3">
          <Library className="h-6 w-6 text-muted-foreground/40" />
          <span className="text-lg font-bold tracking-wide font-outfit text-muted-foreground/30">My Library</span>
        </div>

        {/* Main Sections placeholder */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div className="space-y-1">
            <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 animate-pulse">
              <Clock className="h-4.5 w-4.5 text-muted-foreground/30" />
              <div className="h-4 bg-muted/50 rounded w-28"></div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="px-3 text-xs font-semibold tracking-wider text-muted-foreground/35 uppercase">
              Courses
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-muted/20 animate-pulse">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-4.5 w-4.5 text-muted-foreground/20" />
                    <div className="h-3.5 bg-muted/45 rounded w-20"></div>
                  </div>
                  <div className="h-4 bg-muted/50 rounded-full w-5"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <section className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 text-muted-foreground/45">
              <PanelLeft size={20} className="animate-pulse" />
            </div>
            <span className="text-base font-bold tracking-tight text-muted-foreground/60">Library</span>
          </div>
        </div>

        {/* Main Content Scroll Container */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* DESKTOP HEADER ROW */}
          <div className="hidden md:flex px-6 py-5 border-b border-border/40 bg-card/20 flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 bg-muted rounded-xl w-32 animate-pulse"></div>
                <div className="p-1.5 text-muted-foreground/40">
                  <RefreshCw className="h-4 w-4 animate-spin opacity-50" />
                </div>
              </div>

              {/* View style toggle */}
              <div className="flex items-center bg-muted/40 p-1 rounded-xl gap-1">
                <div className="p-1.5 rounded-lg text-muted-foreground/30"><List className="h-4.5 w-4.5" /></div>
                <div className="p-1.5 rounded-lg text-muted-foreground/30"><LayoutGrid className="h-4.5 w-4.5" /></div>
              </div>
            </div>

            {/* Search & Academic period filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md bg-muted/30 rounded-xl h-9 animate-pulse"></div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-muted/30 h-9 w-28 animate-pulse"></div>
                <div className="rounded-xl bg-muted/30 h-9 w-28 animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* MOBILE REPLICA TOP LAYOUT */}
          <div className="md:hidden flex-1 flex flex-col bg-background pt-4 gap-3.5 overflow-y-auto">
            {/* Search input placeholder */}
            <div className="px-4">
              <div className="w-full rounded-full bg-muted/40 h-10 animate-pulse"></div>
            </div>

            {/* Tab bar placeholder */}
            <div className="flex gap-8 px-6 pt-5 pb-3 border-b border-border/30">
              <div className="h-5 bg-muted rounded w-16 animate-pulse"></div>
              <div className="h-5 bg-muted rounded w-16 animate-pulse"></div>
            </div>

            {/* Mobile document cards list area */}
            <div className="flex-1 px-4 py-2">
              <div className="grid grid-cols-2 gap-3.5 py-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-[4/3] rounded-xl bg-muted/30 animate-pulse"></div>
                ))}
              </div>
            </div>
          </div>

          {/* DESKTOP MAIN WINDOW VIEWS */}
          <div className="hidden md:block flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
              <div className="h-4 bg-muted/40 rounded w-32 animate-pulse pl-1"></div>
              
              <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                  <div 
                    key={i} 
                    className="flex flex-col rounded-xl border border-border/50 bg-card/60 overflow-hidden animate-pulse"
                  >
                    {/* Mock Thumbnail box */}
                    <div className="w-full aspect-[4/3] bg-muted/45 shrink-0 border-b border-border/30"></div>
                    
                    {/* Mock metadata line */}
                    <div className="flex items-center py-2 px-2.5 min-w-0 gap-1.5 bg-muted/15">
                      <div className="w-3.5 h-3.5 rounded bg-muted/40 shrink-0"></div>
                      <div className="h-3 bg-muted/45 rounded w-3/4"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. RIGHT DETAILS SIDEBAR - DESKTOP ONLY */}
      <aside className="hidden xl:flex flex-col w-80 shrink-0 border-l border-border/60 bg-card/35 backdrop-blur-md overflow-y-auto">
        <div className="p-6 flex flex-col h-full space-y-6">
          <div className="flex items-center justify-between border-b border-border/30 pb-4">
            <div className="h-4 bg-muted/50 rounded w-28 animate-pulse"></div>
          </div>

          {/* Large Preview */}
          <div className="w-full aspect-[4/3] rounded-xl bg-muted/40 animate-pulse shadow-sm"></div>

          {/* Title and stats */}
          <div className="space-y-4 flex-1">
            <div className="space-y-2">
              <div className="h-5 bg-muted/50 rounded w-5/6 animate-pulse"></div>
              <div className="h-3.5 bg-muted/40 rounded w-1/2 animate-pulse"></div>
            </div>

            <hr className="border-border/40" />

            <div className="space-y-3.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="h-3 bg-muted/30 rounded w-16 animate-pulse"></div>
                  <div className="h-3 bg-muted/40 rounded w-20 animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
      
    </div>
  );
}
