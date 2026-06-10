import React from 'react';

export default function QuizLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile Header Placeholder */}
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-card/95 px-4 py-3 backdrop-blur-sm md:hidden">
        <div className="w-8 h-8 rounded-lg bg-accent animate-pulse mr-2"></div>
        <div className="h-4 bg-accent rounded-md w-16 animate-pulse"></div>
      </div>

      <main className="mx-auto flex w-full max-w-[23.5rem] flex-col gap-6 px-5 pb-12 pt-6 sm:max-w-[26rem] sm:px-6 md:max-w-7xl md:gap-8 md:px-8 md:py-10 lg:px-8">
        {/* Header Skeleton */}
        <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl space-y-3 w-full">
            <div className="h-10 bg-accent rounded-xl w-32 animate-pulse hidden md:block"></div>
            <div className="h-4 bg-accent rounded-md w-3/4 animate-pulse"></div>
          </div>
          {/* New Quiz Button Placeholder */}
          <div className="h-12 bg-accent rounded-2xl w-full md:w-32 animate-pulse md:min-h-11 md:rounded-lg"></div>
        </header>

        {/* Analytics StatCards Skeleton */}
        <section className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-background/90 p-4 md:rounded-lg md:bg-card md:p-5 flex justify-between items-start">
              <div className="space-y-3 flex-1">
                {/* Stat label */}
                <div className="h-4 bg-accent rounded-md w-1/2 animate-pulse"></div>
                {/* Stat value */}
                <div className="h-7 bg-accent rounded-md w-1/3 animate-pulse"></div>
              </div>
              {/* Icon placeholder */}
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-2xl md:rounded-lg bg-accent animate-pulse shrink-0"></div>
            </div>
          ))}
        </section>

        {/* Recent Quizzes List Skeleton */}
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            {/* Title */}
            <div className="h-6 bg-accent rounded-md w-36 animate-pulse"></div>
            {/* Subtext */}
            <div className="h-4 bg-accent rounded-md w-80 animate-pulse hidden md:block"></div>
          </div>

          {/* Table Skeleton */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-4 space-y-4">
              {[1, 2, 3].map((row) => (
                <div key={row} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-3 border-b border-border/40 last:border-0">
                  <div className="space-y-2 flex-1 w-full">
                    {/* Quiz Title */}
                    <div className="h-5 bg-accent rounded-md w-2/3 animate-pulse"></div>
                    {/* Quiz Metadata */}
                    <div className="h-4 bg-accent rounded-md w-1/3 animate-pulse"></div>
                  </div>
                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
                    {/* Score */}
                    <div className="h-5 bg-accent rounded-md w-16 animate-pulse"></div>
                    {/* Date */}
                    <div className="h-5 bg-accent rounded-md w-20 animate-pulse"></div>
                    {/* Action button */}
                    <div className="h-8 bg-accent rounded-lg w-16 animate-pulse"></div>
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
