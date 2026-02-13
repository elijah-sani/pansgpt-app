import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
    progress: number; // 0 to 100
}

export function LoadingState({ progress }: LoadingStateProps) {
    const clampedProgress = Math.min(100, Math.max(0, progress));

    // Dynamic Text based on progress
    const getStatusText = (p: number) => {
        if (p < 30) return "Synthesizing Request...";
        if (p < 60) return "Downloading Formula...";
        if (p < 99) return "Finalizing Compound...";
        return "Complete";
    };

    return (
        <div className="flex flex-col items-center justify-center h-full gap-8 animate-in fade-in duration-700">
            {/* 1. The Capsule Pill */}
            <div className="relative w-16 h-48 rounded-full border-4 border-white/20 dark:border-white/10 bg-black/20 overflow-hidden shadow-[0_0_30px_color-mix(in_srgb,var(--primary),transparent_80%)]">

                {/* Fill Animation */}
                <div
                    className="absolute bottom-0 left-0 right-0 bg-primary shadow-[0_0_20px_color-mix(in_srgb,var(--primary),transparent_50%)] transition-all duration-300 ease-out"
                    style={{ height: `${clampedProgress}%` }}
                >
                    {/* Liquid Highlight */}
                    <div className="absolute top-0 left-0 right-0 h-2 bg-white/30 skew-y-6" />
                </div>

                {/* Glass Reflection */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
            </div>

            {/* 2. Status Text */}
            <div className="text-center space-y-2">
                <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
                    {Math.round(clampedProgress)}%
                </h3>
                <div className="flex items-center gap-2 text-muted-foreground font-medium">
                    {clampedProgress < 100 && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                    <span className="tracking-wide animate-pulse">
                        {getStatusText(clampedProgress)}
                    </span>
                </div>
            </div>
        </div>
    );
}
