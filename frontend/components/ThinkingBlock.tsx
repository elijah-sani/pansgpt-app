'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown } from 'lucide-react';

export interface ThinkingBlockProps {
  thinkingText: string;
  isStreaming: boolean;
  status?: string;
}

/**
 * ThinkingToggle — inline header button beside the avatar.
 *
 * Starts a live elapsed-second counter the moment isStreaming=true,
 * before any thinking text has arrived, so the user sees the toggle
 * and a ticking counter immediately.
 */
export function ThinkingToggle({
  isStreaming,
  expanded,
  onToggle,
  status,
}: {
  isStreaming: boolean;
  expanded: boolean;
  onToggle: () => void;
  status?: string;
}) {
  let label: string;
  if (isStreaming) {
    label = status || 'Thinking…';
  } else {
    label = 'Thought';
  }

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
 *
 * Uses the identical 24 ms per-character typewriter that the welcome-screen
 * greeting subtext uses. Each time new text arrives from the stream, the
 * typewriter resumes from where it left off and types the new characters in.
 * While waiting for the first chunk, a bouncing-dot placeholder is shown.
 */
export function ThinkingPanel({
  thinkingText,
  isStreaming,
}: {
  thinkingText: string;
  isStreaming: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // typedText is what's actually rendered — it trails behind thinkingText
  // while new characters are being typed in one at a time at 24 ms/char.
  const [typedText, setTypedText] = useState('');
  const typedLenRef = useRef(0);   // how many chars are already rendered
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    // Whenever the target text grows (new chunk arrived), kick off / extend the typewriter.
    if (thinkingText.length <= typedLenRef.current) return;

    // Clear any running interval so we don't double-tick
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      // Skip animation — render the full text immediately
      typedLenRef.current = thinkingText.length;
      setTypedText(thinkingText);
      return;
    }

    intervalRef.current = window.setInterval(() => {
      typedLenRef.current += 1;
      setTypedText(thinkingText.slice(0, typedLenRef.current));
      if (typedLenRef.current >= thinkingText.length) {
        window.clearInterval(intervalRef.current!);
        intervalRef.current = null;
      }
    }, 24);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [thinkingText]);

  // When streaming ends, flush any un-typed remainder instantly
  useEffect(() => {
    if (!isStreaming && thinkingText && typedLenRef.current < thinkingText.length) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      typedLenRef.current = thinkingText.length;
      setTypedText(thinkingText);
    }
  }, [isStreaming, thinkingText]);

  // Reset when a new stream begins (text goes back to empty)
  useEffect(() => {
    if (isStreaming && thinkingText === '') {
      typedLenRef.current = 0;
      setTypedText('');
    }
  }, [isStreaming, thinkingText]);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [typedText, isStreaming]);

  const isEmpty = !typedText;

  return (
    <div
      ref={scrollRef}
      className="mb-3 overflow-auto max-h-64 pr-4 py-4 text-sm text-muted-foreground leading-relaxed"
      style={{
        fontFamily: "'Inter', sans-serif",
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%)',
      }}
    >
      {isEmpty && isStreaming ? (
        /* Waiting placeholder — three bouncing dots while planner hasn't responded yet */
        <span className="flex items-center gap-1 opacity-60">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
        </span>
      ) : (
        <>
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
            {typedText}
          </ReactMarkdown>
          {/* Blinking cursor while still typing or streaming */}
          {(isStreaming || typedLenRef.current < thinkingText.length) && (
            <span className="inline-block w-[2px] h-[0.9em] bg-muted-foreground/70 ml-0.5 align-middle animate-pulse" />
          )}
        </>
      )}
    </div>
  );
}

/**
 * ThinkingBlock — standalone usage (not used in main chat, kept for other contexts).
 */
export default function ThinkingBlock({ thinkingText, isStreaming, status }: ThinkingBlockProps) {
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
        status={status}
      />
      {expanded && (
        <div className="mt-2">
          <ThinkingPanel thinkingText={thinkingText} isStreaming={isStreaming} />
        </div>
      )}
    </div>
  );
}
