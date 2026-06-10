'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface ThinkingModeToggleProps {
  thinkingMode: boolean;
  onChange: (value: boolean) => void;
}

export default function ThinkingModeToggle({ thinkingMode, onChange }: ThinkingModeToggleProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  const select = (value: boolean) => {
    onChange(value);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Trigger — word + chevron, no pill */}
      <button
        type="button"
        id="thinking-mode-toggle-btn"
        onClick={() => setOpen(!open)}
        title={thinkingMode ? 'Thinking mode active' : 'Fast mode active'}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
      >
        <span>{thinkingMode ? 'Think' : 'Fast'}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Popup card — stacked options with divider */}
      {open && (
        <div
          role="dialog"
          aria-label="Response mode"
          className="absolute bottom-full mb-2 right-0 z-50 w-44 rounded-xl border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Fast option */}
          <button
            type="button"
            id="thinking-mode-fast-option"
            onClick={() => select(false)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent transition-colors"
          >
            <div>
              <p className="text-xs font-medium text-foreground">Fast</p>
              <p className="text-[10px] text-muted-foreground">Quick responses</p>
            </div>
            {!thinkingMode && (
              <Check size={15} className="text-green-500 shrink-0" />
            )}
          </button>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Think option */}
          <button
            type="button"
            id="thinking-mode-thinking-option"
            onClick={() => select(true)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent transition-colors"
          >
            <div>
              <p className="text-xs font-medium text-foreground">Think</p>
              <p className="text-[10px] text-muted-foreground">Reasons before answering</p>
            </div>
            {thinkingMode && (
              <Check size={15} className="text-green-500 shrink-0" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
