'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface ThinkingModeToggleProps {
  thinkingMode: boolean;
  onChange: (value: boolean) => void;
}

export default function ThinkingModeToggle({ thinkingMode, onChange }: ThinkingModeToggleProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popup on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectFast = () => {
    onChange(false);
    setOpen(false);
  };

  const toggleThinking = () => {
    onChange(!thinkingMode);
    // Keep popup open so user sees the toggle flip
  };

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Trigger button */}
      <button
        type="button"
        id="thinking-mode-toggle-btn"
        onClick={() => setOpen((prev) => !prev)}
        title={thinkingMode ? 'Thinking mode active' : 'Fast mode active'}
        className={`p-2 rounded-full transition-colors text-muted-foreground ${
          thinkingMode
            ? 'text-blue-500 hover:bg-blue-500/10'
            : 'hover:text-foreground hover:bg-accent'
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="text-base leading-none select-none" aria-hidden="true">
          {thinkingMode ? '🧠' : '⚡'}
        </span>
      </button>

      {/* Popup panel — positioned above the trigger */}
      {open && (
        <div
          role="dialog"
          aria-label="Response mode"
          className="absolute bottom-full mb-2 right-0 z-50 w-64 rounded-2xl border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Fast row */}
          <button
            type="button"
            id="thinking-mode-fast-option"
            onClick={selectFast}
            className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent ${
              !thinkingMode ? 'bg-accent/60' : ''
            }`}
          >
            <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden="true">⚡</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Fast</p>
              <p className="text-xs text-muted-foreground mt-0.5">Quick responses</p>
            </div>
            {!thinkingMode && (
              <span className="shrink-0 mt-1 w-2 h-2 rounded-full bg-primary self-start" aria-label="Active" />
            )}
          </button>

          {/* Divider */}
          <div className="h-px bg-border mx-3" />

          {/* Thinking row */}
          <button
            type="button"
            id="thinking-mode-thinking-option"
            onClick={toggleThinking}
            className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent ${
              thinkingMode ? 'bg-accent/60' : ''
            }`}
          >
            <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden="true">🧠</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Thinking</p>
              <p className="text-xs text-muted-foreground mt-0.5">Reasons before answering</p>
            </div>
            {/* Pill toggle */}
            <div
              aria-checked={thinkingMode}
              role="switch"
              className={`shrink-0 mt-1 relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                thinkingMode ? 'bg-blue-500' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                  thinkingMode ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
