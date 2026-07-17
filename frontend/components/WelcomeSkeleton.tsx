export default function WelcomeSkeleton() {
  return (
    <div className="flex-1 flex flex-col items-start justify-start px-4 pb-0 pt-16 text-left sm:items-center sm:justify-center sm:px-0 sm:pb-56 sm:pt-40 sm:text-center animate-pulse">
      <div className="w-full max-w-[440px] flex flex-col flex-1 sm:mx-auto sm:max-w-4xl sm:block">
        
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
          {/* Mobile-only subtext line */}
          <div className="mt-4 h-4 bg-accent/25 rounded-md w-32 sm:hidden" />
        </div>

        {/* Desktop-only Input Box Skeleton */}
        <div className="mt-6 hidden sm:block">
          <div className="w-full h-11 rounded-2xl bg-accent/20 border border-border/40" />
        </div>

        {/* Quick Action Cards Skeleton */}
        <div className="mt-24 sm:mt-8 w-full px-0 sm:px-4">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 w-full rounded-xl bg-accent/15 sm:h-8 sm:w-36 sm:rounded-[6px] sm:border sm:border-border/40"
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
