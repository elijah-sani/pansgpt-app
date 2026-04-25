'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

/**
 * OfflineBanner
 *
 * Mounts at the very top of the app (inside the layout).
 * Slides down when the user goes offline, disappears when back online.
 * Shows a brief "Back online" confirmation for 3 s after reconnection.
 *
 * z-index: 200 — sits above the sidebar (z-40) and modals (z-[100]) alike,
 * but below any spinner/toast overlays the app may use.
 */
export default function OfflineBanner() {
  const { isOffline } = useOfflineStatus();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOffline) {
      setShowBackOnline(false);
      setVisible(true);
    } else {
      if (visible) {
        // Just came back online — show a brief confirmation then hide
        setShowBackOnline(true);
        setVisible(true);
        const timer = setTimeout(() => {
          setShowBackOnline(false);
          setVisible(false);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2
        px-4 py-2 text-xs font-semibold
        animate-in slide-in-from-top duration-300
        ${showBackOnline
          ? 'bg-emerald-500 text-white'
          : 'bg-amber-500 text-white'
        }
      `}
    >
      {showBackOnline ? (
        /* Back online confirmation */
        <span className="flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Back online — notes synced
        </span>
      ) : (
        /* Offline indicator */
        <span className="flex items-center gap-1.5">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          You&apos;re offline. Showing cached content.
        </span>
      )}
    </div>
  );
}
