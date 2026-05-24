'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface ThinkingBlockProps {
  thinkingText: string;
  isStreaming: boolean; // true while thinking_delta events are arriving
}

export default function ThinkingBlock({ thinkingText, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  // Nothing to show
  if (!isStreaming && !thinkingText) return null;

  // Streaming in progress — animated pulse banner
  if (isStreaming) {
    return (
      <div
        id="thinking-block-streaming"
        className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl border border-blue-500/20 bg-blue-500/5 text-blue-400 text-sm font-medium"
        style={{ animation: 'pulse 1.8s ease-in-out infinite' }}
      >
        <span className="text-base leading-none" aria-hidden="true">🧠</span>
        <span>Thinking…</span>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.45; }
          }
        `}</style>
      </div>
    );
  }

  // Done streaming, has content — collapsible block
  return (
    <div
      id="thinking-block-done"
      className="mb-3 rounded-xl border border-border overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors text-left"
      >
        <span className="text-base leading-none shrink-0" aria-hidden="true">🧠</span>
        <span className="flex-1">Reasoning</span>
        <ChevronDown
          size={15}
          className={`shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-3 border-l-2 border-l-blue-500/40">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground overflow-auto max-h-80">
            {thinkingText}
          </pre>
        </div>
      )}
    </div>
  );
}
