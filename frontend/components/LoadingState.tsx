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

                {/* The Liquid Container */}
                <div
                    className="absolute bottom-0 left-0 right-0 transition-all duration-300 ease-out"
                    style={{ height: `${clampedProgress}%` }}
                >
                    {/* Solid Fill Block - Placed first to be behind waves */}
                    {/* Using top: -3px to force overlap with wave bottom and prevent gap */}
                    <div
                        className="absolute bottom-0 left-0 right-0 bg-primary shadow-[0_0_20px_color-mix(in_srgb,var(--primary),transparent_50%)]"
                        style={{ top: '-3px' }}
                    />

                    {/* Floating Bubbles (Particles) */}
                    {/* We could add actual particle divs here if needed, but keeping it clean for now */}

                    {/* Wave Layer 1 (Back/Darker) */}
                    <div className="absolute -top-3 left-0 right-0 h-4 w-[200%] animate-wave opacity-60"
                        style={{
                            // Using a repeating SVG background or mask would be ideal, but for pure CSS/SVG:
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 88.7'%3E%3Cpath d='M800 56.9c-155.5 0-204.9-50-405.5-49.9-200 0-250 49.9-394.5 49.9v31.8h800v-.2-31.6z' fill='%2353d22d'/%3E%3C/svg%3E")`,
                            backgroundSize: '50% 100%',
                            animationDuration: '6s',
                            filter: 'brightness(0.8)'
                        }}
                    />

                    {/* Wave Layer 2 (Front/Lighter) */}
                    <div className="absolute -top-3 left-0 right-0 h-4 w-[200%] animate-wave"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 88.7'%3E%3Cpath d='M800 56.9c-155.5 0-204.9-50-405.5-49.9-200 0-250 49.9-394.5 49.9v31.8h800v-.2-31.6z' fill='%2353d22d'/%3E%3C/svg%3E")`,
                            backgroundSize: '50% 100%',
                            animationDuration: '4s',
                            marginLeft: '-20px' // Offset
                        }}
                    />
                </div>

                {/* Glass Reflection */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
            </div>

            {/* 2. Status Text */}
            <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold font-mono tracking-tighter text-foreground">
                    {Math.round(clampedProgress)}%
                </h3>
                <div className="flex items-center gap-2 text-muted-foreground font-medium text-sm uppercase tracking-widest">
                    {clampedProgress < 100 && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                    <span className="animate-pulse">
                        {getStatusText(clampedProgress)}
                    </span>
                </div>
            </div>
        </div>
    );
}
