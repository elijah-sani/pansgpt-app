'use client';

import React from 'react';
import Logo from '@/components/Logo';

type ErrorRecoveryViewProps = {
  title: string;
  description: string;
  sectionLabel?: string;
  errorMessage?: string | null;
  fullScreen?: boolean;
  retryLabel?: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
  tertiaryLabel?: string;
  onTertiaryAction?: () => void;
};

export default function ErrorRecoveryView({
  title,
  description,
  sectionLabel,
  errorMessage,
  fullScreen = false,
  retryLabel = 'Try Again',
  onRetry,
  retryDisabled = false,
  secondaryLabel,
  onSecondaryAction,
  tertiaryLabel,
  onTertiaryAction,
}: ErrorRecoveryViewProps) {
  const shellClassName = fullScreen
    ? 'min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/50 px-4 py-10'
    : 'mx-auto flex h-full min-h-[60vh] w-full max-w-3xl items-center justify-center px-4 py-10 sm:px-6';

  const cardClassName = fullScreen
    ? 'w-full max-w-xl rounded-[28px] border border-border bg-card/95 p-8 shadow-2xl'
    : 'w-full rounded-[28px] border border-border bg-card/95 p-8 shadow-xl';

  return (
    <div className={shellClassName}>
      <div className={cardClassName}>
        <div className="text-center">
          <div className="mx-auto inline-flex items-center gap-3">
            <Logo className="h-7 w-7 shrink-0" />
            <span className="text-sm font-semibold tracking-tight text-foreground">PansGPT</span>
          </div>
        </div>

        <div className="mt-6 text-center">
          {sectionLabel ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{sectionLabel}</p>
          ) : null}
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>

        {process.env.NODE_ENV !== 'production' && errorMessage ? (
          <details className="mt-6 rounded-2xl border border-border bg-background/70 p-4 text-left">
            <summary className="cursor-pointer text-sm font-medium text-foreground">Error details</summary>
            <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-xs text-rose-600">{errorMessage}</pre>
          </details>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={retryDisabled}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retryLabel}
            </button>
          ) : null}

          {onSecondaryAction && secondaryLabel ? (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {secondaryLabel}
            </button>
          ) : null}

          {onTertiaryAction && tertiaryLabel ? (
            <button
              type="button"
              onClick={onTertiaryAction}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {tertiaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
