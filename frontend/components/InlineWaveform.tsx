import React from 'react';

interface InlineWaveformProps {
    volume: number; // 0 to 100
}

export function InlineWaveform({ volume }: InlineWaveformProps) {
    // Increase bar count to span wider screens (e.g., desktop chat input)
    const bars = Array.from({ length: 72 }, (_, i) => i);

    return (
        <div className="flex items-center justify-center gap-1 sm:gap-1.5 h-6 w-full max-w-2xl overflow-hidden px-4">
            {bars.map((index) => {
                // Adjust shape factor center calculation for 72 bars
                const centerDist = Math.abs(index - 36);
                const shapeFactor = 1 - (centerDist / 36) * 0.5; // 1.0 at center, 0.5 at edges

                // Let's stick to the requested prompt formula idea roughly:
                // scaleY( 1 + (volume/100) * Math.abs(Math.sin(index)) )
                // But we want a base height.

                // 1. Minimum height (so it's visible as a small dot/line)
                const minScale = 0.15;

                // 2. Variable height added by volume
                // We use Math.sin(index) to give it "peaks and valleys" across the width
                // We user Math.random() in a real visualizer, but here we want deterministic based on index for the "shape"
                // The prompt asked for: scaleY( 1 + (volume/100) * Math.abs(Math.sin(index)) )
                // Let's adjust to keep it within bounds of the h-6 container

                const scale = Math.max(minScale, Math.min(1.0,
                    0.15 + (volume / 60) * Math.abs(Math.sin(index * 0.4)) * shapeFactor
                ));

                return (
                    <div
                        key={index}
                        className="w-[3px] min-w-[3px] flex-shrink-0 bg-primary rounded-full transition-transform duration-75 ease-linear will-change-transform"
                        style={{
                            height: '24px',
                            transform: `scaleY(${scale})`,
                            opacity: 0.8 + (volume / 100) * 0.2
                        }}
                    />
                );
            })}
        </div>
    );
}
