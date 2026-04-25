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
  // Always start online — safe for SSR (never touch navigator during render).
  // The real value is synced inside useEffect, which only runs on the client.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Sync immediately on mount
    setIsOnline(navigator.onLine);

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOnline, isOffline: !isOnline };
}
