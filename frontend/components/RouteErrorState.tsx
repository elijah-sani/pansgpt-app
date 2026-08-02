'use client';

import { useEffect } from 'react';
import ErrorRecoveryView from '@/components/ErrorRecoveryView';
import {
  detectAppSection,
  getSafeHomeRoute,
  getSectionLabel,
  reportFrontendError,
} from '@/lib/frontend-error-reporting';

export default function RouteErrorState({
  error,
  reset,
  title,
  description,
  homeHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  description: string;
  homeHref?: string;
}) {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const section = detectAppSection(pathname);
  const safeHomeHref = homeHref || getSafeHomeRoute(pathname);

  useEffect(() => {
    void reportFrontendError({
      scope: 'route',
      boundary: `${section}-route-error`,
      pathname,
      section,
      message: error.message || 'Unknown route error',
      stack: error.stack || null,
      componentStack: null,
      digest: error.digest || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      timestamp: new Date().toISOString(),
    });
  }, [error, pathname, section]);

  return (
    <ErrorRecoveryView
      title={title}
      description={description}
      errorMessage={error.message}
      retryLabel="Retry Page"
      onRetry={reset}
    />
  );
}
