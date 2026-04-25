'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

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
        setShowBackOnline(true);
        setVisible(true);
        const timer = setTimeout(() => {
          setShowBackOnline(false);
          setVisible(false);
        }, 2500);
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
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[200]
        flex items-center gap-2 px-4 py-2
        rounded-full text-xs font-medium text-white shadow-lg
        animate-in fade-in slide-in-from-bottom-2 duration-200
        ${showBackOnline ? 'bg-emerald-500' : 'bg-neutral-800'}
      `}
    >
      {showBackOnline ? (
        <>
          <Wifi className="w-3.5 h-3.5 shrink-0" />
          Back online
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          You&apos;re offline
        </>
      )}
    </div>
  );
}
