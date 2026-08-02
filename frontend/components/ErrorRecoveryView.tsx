'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

type ErrorRecoveryViewProps = {
  title: string;
  description: string; // Kept in props for API compatibility, but not rendered
  errorMessage?: string | null;
  fullScreen?: boolean;
  retryLabel?: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
};

export default function ErrorRecoveryView({
  title,
  errorMessage,
  fullScreen = false,
  retryLabel = 'Try Again',
  onRetry,
  retryDisabled = false,
}: ErrorRecoveryViewProps) {
  const containerClass = fullScreen 
    ? 'flex min-h-[100dvh] w-full flex-col items-center justify-center p-6 text-center bg-background' 
    : 'flex min-h-[400px] w-full flex-col items-center justify-center p-6 text-center';

  return (
    <div className={containerClass}>
      <div className="flex max-w-md flex-col items-center space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Page Failed to Load</h2>

        {process.env.NODE_ENV !== 'production' && errorMessage && (
          <div className="w-full rounded-md bg-muted/50 p-4 text-left">
            <p className="font-mono text-xs text-muted-foreground break-words">{errorMessage}</p>
          </div>
        )}

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            title={retryLabel}
            aria-label={retryLabel}
            className="rounded-md border border-input p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
