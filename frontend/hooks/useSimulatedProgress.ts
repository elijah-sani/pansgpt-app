import { useState, useEffect, useRef } from 'react';

/**
 * Manages a progress bar that starts with a "simulation" to give immediate feedback,
 * then merges with real data when it catches up.
 * 
 * @param realProgress - The actual progress (0-100) from the download stream.
 */
export function useSimulatedProgress(realProgress: number | null) {
    const [displayProgress, setDisplayProgress] = useState(0);
    const simulationInterval = useRef<NodeJS.Timeout | null>(null);

    // 1. Simulation Logic
    useEffect(() => {
        // Start simulation only if we haven't started yet and don't have real progress
        if (displayProgress === 0 && (!realProgress || realProgress === 0)) {
            simulationInterval.current = setInterval(() => {
                setDisplayProgress(prev => {
                    // Stop simulation around 33% (The "Pause" Point)
                    if (prev >= 33) {
                        if (simulationInterval.current) clearInterval(simulationInterval.current);
                        return prev;
                    }
                    // Add random increment (2-5%)
                    return prev + Math.floor(Math.random() * 3) + 2;
                });
            }, 300); // Update every 300ms
        }

        return () => {
            if (simulationInterval.current) clearInterval(simulationInterval.current);
        };
    }, []);

    // 2. Merging Real Data
    useEffect(() => {
        if (realProgress !== null) {
            // Stop simulation once real data arrives
            if (simulationInterval.current) clearInterval(simulationInterval.current);

            // Always pick the larger value to prevent backward jumps
            setDisplayProgress(prev => {
                // If real progress completes, jump to 100
                if (realProgress >= 100) return 100;
                return Math.max(prev, realProgress);
            });
        }
    }, [realProgress]);

    return displayProgress;
}
