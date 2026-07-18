export default function WelcomeSkeleton() {
  return (
    <div className="flex-1 flex flex-col items-start justify-start px-4 pb-0 pt-16 text-left sm:items-center sm:justify-start sm:px-0 sm:pb-24 sm:pt-10 sm:text-center animate-pulse">
      <div className="w-full max-w-[440px] flex flex-col flex-1 sm:mx-auto sm:max-w-[709px] sm:block">
        
        {/* Welcome Avatar & Title Skeleton */}
        <div className="text-left sm:px-4 sm:text-center">
          <div className="mb-4 flex flex-col items-start justify-start gap-3 sm:mb-3 sm:flex-row sm:items-center sm:justify-center">
            {/* Avatar Circle */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center sm:h-9 sm:w-9">
              <div className="h-8 w-8 rounded-full bg-accent/30 sm:h-7 sm:w-7" />
            </div>
            {/* Title Line */}
            <div className="h-7 bg-accent/30 rounded-lg w-48 sm:h-9 sm:w-64" />
          </div>
          {/* Mobile-only subtext line (represented as two lines to match typed subtext duration and wrapping) */}
          <div className="mt-4 space-y-2 sm:hidden">
            <div className="h-3.5 bg-accent/25 rounded-md w-48" />
            <div className="h-3.5 bg-accent/25 rounded-md w-32" />
          </div>
        </div>

        {/* Desktop-only Input Box Skeleton - mimics ChatInput's actual style and size */}
        <div className="mt-6 hidden sm:block w-full px-4 sm:px-0">
          <div className="relative flex flex-col bg-card rounded-[28px] border border-border/40 p-4 shadow-lg shadow-black/5 h-[128px]">
            {/* Input placeholder line */}
            <div className="h-4 bg-accent/20 rounded-md w-1/3 mt-1" />
            
            {/* Controls row */}
            <div className="flex items-center justify-between mt-auto">
              {/* Attachment Icon */}
              <div className="h-9 w-9 rounded-full bg-accent/15" />
              {/* Voice/Send Icon */}
              <div className="h-9 w-9 rounded-full bg-accent/15" />
            </div>
          </div>
        </div>

        {/* Mobile spacing pushes cards to bottom */}
        <div className="flex-1 sm:hidden" />

        {/* Quick Action Cards Skeleton - matches number of cards and their respective shapes/widths */}
        <div className="mt-24 sm:mt-3 w-full px-0 sm:px-4">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-2">
            {[
              { w: 'w-24 sm:w-20' },
              { w: 'w-20 sm:w-14' },
              { w: 'w-28 sm:w-20' },
              { w: 'w-24 sm:w-16' },
              { w: 'w-24 sm:w-20' }
            ].map((card, idx) => (
              <div
                key={idx}
                className="flex w-full items-center gap-4 rounded-xl bg-transparent px-2 py-3.5 sm:inline-flex sm:h-8 sm:w-auto sm:items-center sm:gap-1.5 sm:rounded-[6px] sm:border sm:border-border/40 sm:bg-card sm:px-3"
              >
                {/* Card Icon placeholder */}
                <div className="h-5 w-5 shrink-0 rounded-md bg-accent/20 sm:h-4 sm:w-4" />
                {/* Card Title placeholder */}
                <div className={`h-4 bg-accent/20 rounded-md ${card.w} sm:h-3`} />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
