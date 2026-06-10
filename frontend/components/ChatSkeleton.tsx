export default function ChatSkeleton() {
    return (
        <div className="w-full max-w-[776px] mx-auto p-4 space-y-8">
            {/* AI Message Skeleton */}
            <div className="flex flex-col items-start gap-1 w-full">
                <div className="flex items-center gap-3 mb-1">
                    <div className="relative flex items-center justify-center w-10 h-10 shrink-0 -ml-1.5">
                        <div className="h-8 w-8 rounded-full bg-accent/30 animate-pulse"></div>
                    </div>
                </div>
                <div className="space-y-3 w-full pl-0">
                    <div className="h-4 bg-accent/30 rounded-md w-[85%] animate-pulse"></div>
                    <div className="h-4 bg-accent/30 rounded-md w-full animate-pulse"></div>
                    <div className="h-4 bg-accent/30 rounded-md w-[70%] animate-pulse"></div>
                </div>
            </div>

            {/* User Message Skeleton */}
            <div className="flex flex-col items-end w-full">
                <div className="max-w-[85%] w-[45%] h-12 bg-primary/10 dark:bg-secondary/30 rounded-2xl rounded-tr-sm animate-pulse"></div>
            </div>

            {/* AI Message Skeleton 2 */}
            <div className="flex flex-col items-start gap-1 w-full">
                <div className="flex items-center gap-3 mb-1">
                    <div className="relative flex items-center justify-center w-10 h-10 shrink-0 -ml-1.5">
                        <div className="h-8 w-8 rounded-full bg-accent/30 animate-pulse"></div>
                    </div>
                </div>
                <div className="space-y-3 w-full pl-0">
                    <div className="h-4 bg-accent/30 rounded-md w-full animate-pulse"></div>
                    <div className="h-4 bg-accent/30 rounded-md w-[60%] animate-pulse"></div>
                </div>
            </div>
        </div>
    );
}
