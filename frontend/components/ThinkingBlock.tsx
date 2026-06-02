'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown } from 'lucide-react';

export interface ThinkingBlockProps {
  thinkingText: string;
  isStreaming: boolean;
}

/**
 * ThinkingToggle — just the inline header button.
 * Rendered beside the avatar inside MessageBubble.
 */
export function ThinkingToggle({
  isStreaming,
  expanded,
  onToggle,
  thinkingDuration,
}: {
  isStreaming: boolean;
  expanded: boolean;
  onToggle: () => void;
  thinkingDuration?: number | null;
}) {
  const label = thinkingDuration !== undefined && thinkingDuration !== null
    ? `Thought for ${thinkingDuration}s`
    : (isStreaming ? 'Thinking…' : 'Thought');

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors select-none"
    >
      <span>{label}</span>
      <ChevronDown
        size={12}
        className={`shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

/**
 * ThinkingPanel — the expanded content area.
 * Rendered below the avatar row, above the answer.
 */
export function ThinkingPanel({
  thinkingText,
  isStreaming,
}: {
  thinkingText: string;
  isStreaming: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thinkingText, isStreaming]);

  return (
    <div
      ref={scrollRef}
      className="mb-3 overflow-auto max-h-64 pr-4 py-4 text-sm text-muted-foreground leading-relaxed"
      style={{
        fontFamily: "'Inter', sans-serif",
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%)'
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ ...props }) => <p className="mb-1 last:mb-0" {...props} />,
          ul: ({ ...props }) => <ul className="list-disc pl-4 mb-1" {...props} />,
          ol: ({ ...props }) => <ol className="list-decimal pl-4 mb-1" {...props} />,
          li: ({ ...props }) => <li className="mb-0.5" {...props} />,
          strong: ({ ...props }) => <strong className="text-foreground/80 font-semibold" {...props} />,
          code: ({ ...props }) => (
            <code
              className="px-1 py-0.5 rounded text-xs font-mono bg-amber-500/15 text-amber-300"
              {...props}
            />
          ),
        }}
      >
        {thinkingText}
      </ReactMarkdown>
      {/* Blinking cursor while streaming */}
      {isStreaming && (
        <span className="inline-block w-[2px] h-[0.9em] bg-muted-foreground/70 ml-0.5 align-middle animate-pulse" />
      )}
    </div>
  );
}

/**
 * ThinkingBlock — standalone usage (not used in main chat, kept for other contexts).
 */
export default function ThinkingBlock({ thinkingText, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(isStreaming);
  }, [isStreaming]);

  if (!isStreaming && !thinkingText) return null;

  return (
    <div className="mb-3">
      <ThinkingToggle
        isStreaming={isStreaming}
        expanded={expanded}
        onToggle={() => setExpanded((p) => !p)}
      />
      {expanded && (
        <div className="mt-2">
          <ThinkingPanel thinkingText={thinkingText} isStreaming={isStreaming} />
        </div>
      )}
    </div>
  );
}
