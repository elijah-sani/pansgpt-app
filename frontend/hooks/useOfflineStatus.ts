'use client';

import { useEffect, useState } from 'react';

/**
 * useOfflineStatus
 * Returns { isOnline, isOffline } reflecting navigator.onLine and
 * listening to the browser 'online' / 'offline' window events.
 *
 * SSR-safe: defaults to true (online) on the server so Next.js doesn't
 * hydrate a mismatch.
 */
export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof window !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Sync immediately in case the state changed before the listeners attached
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOnline, isOffline: !isOnline };
}
