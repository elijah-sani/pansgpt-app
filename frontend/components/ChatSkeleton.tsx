export default function ChatSkeleton() {
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-6 w-full max-w-3xl mx-auto">
            {/* AI Message Skeleton */}
            <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent animate-pulse shrink-0"></div>
                <div className="space-y-3 flex-1">
                    <div className="h-4 bg-accent rounded-md w-3/4 animate-pulse"></div>
                    <div className="h-4 bg-accent rounded-md w-full animate-pulse"></div>
                    <div className="h-4 bg-accent rounded-md w-5/6 animate-pulse"></div>
                </div>
            </div>
            {/* User Message Skeleton */}
            <div className="flex gap-4 flex-row-reverse">
                <div className="space-y-3 flex-1 flex flex-col items-end">
                    <div className="h-10 bg-accent rounded-2xl w-1/2 animate-pulse"></div>
                </div>
            </div>
            {/* AI Message Skeleton 2 */}
            <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent animate-pulse shrink-0"></div>
                <div className="space-y-3 flex-1">
                    <div className="h-4 bg-accent rounded-md w-full animate-pulse"></div>
                    <div className="h-4 bg-accent rounded-md w-4/5 animate-pulse"></div>
                </div>
            </div>
        </div>
    );
}
