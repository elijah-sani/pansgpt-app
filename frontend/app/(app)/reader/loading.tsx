import React from 'react';

export default function ReaderLoading() {
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground transition-colors duration-500">
      {/* Mobile header placeholder */}
      <div className="md:hidden flex items-center px-4 py-3 shadow-sm bg-card sticky top-0 z-10 border-b border-border/50">
        <div className="w-8 h-8 rounded-lg bg-accent animate-pulse mr-2"></div>
        <div className="h-4 bg-accent rounded-md w-24 animate-pulse"></div>
      </div>

      <main className="mx-auto max-w-7xl px-6 pt-5 pb-12 md:py-12">
        {/* Header and filters skeleton */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-3">
              {/* "My Library" Title */}
              <div className="h-10 bg-accent rounded-xl w-48 animate-pulse"></div>
              {/* Subtitle */}
              <div className="h-4 bg-accent rounded-md w-80 animate-pulse"></div>
            </div>
            
            {/* Search and filters group */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              {/* Search Box */}
              <div className="h-11 bg-accent rounded-xl w-full md:w-[340px] animate-pulse"></div>
              {/* Select inputs */}
              <div className="flex gap-2">
                <div className="h-11 bg-accent rounded-xl w-28 md:w-40 animate-pulse"></div>
                <div className="h-11 bg-accent rounded-xl w-32 md:w-44 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Content area: Grid of shimmering cards */}
        <div className="space-y-10">
          <div>
            {/* "Current Materials" Section Header */}
            <div className="h-6 bg-accent rounded-md w-36 mb-6 animate-pulse"></div>
            
            {/* Cards Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 rounded-2xl border border-border/60 bg-card p-5 flex flex-col justify-between">
                  <div className="space-y-3">
                    {/* Course Code */}
                    <div className="h-4 bg-accent rounded-md w-1/4 animate-pulse"></div>
                    {/* Title */}
                    <div className="h-6 bg-accent rounded-md w-3/4 animate-pulse"></div>
                  </div>
                  <div className="flex items-center justify-between">
                    {/* Bottom detail 1 */}
                    <div className="h-4 bg-accent rounded-md w-1/3 animate-pulse"></div>
                    {/* Arrow / indicator */}
                    <div className="w-5 h-5 rounded-full bg-accent animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
