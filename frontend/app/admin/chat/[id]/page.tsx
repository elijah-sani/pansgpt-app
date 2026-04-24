'use client';

import React, { use, useEffect, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
  User,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';

interface Message {
  id: number;
  role: 'system' | 'user' | 'assistant';
  content: string;
  image_data?: string;
  created_at: string;
}

interface Profile {
  first_name: string | null;
  other_names: string | null;
  university: string | null;
  level: string | null;
}

interface ChatSession {
  title: string;
  created_at: string;
  user_id: string | null;
  display_name: string;
  profiles: Profile | null;
}

interface RawSessionData {
  title: string;
  created_at: string;
  user_id: string | null;
  profiles?: Profile | Profile[] | null;
}

interface AdminChatPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

const getImages = (imageData?: string): string[] => {
  if (!imageData) return [];
  try {
    if (imageData.trim().startsWith('[') && imageData.trim().endsWith(']')) {
      const parsed = JSON.parse(imageData);
      if (Array.isArray(parsed)) return parsed;
    }
    return [imageData];
  } catch {
    return [imageData];
  }
};

export default function AdminChatViewerPage({ params, searchParams }: AdminChatPageProps) {
  const { id } = use(params);
  const resolvedSearchParams = searchParams ? use(searchParams) : {};
  const rawMessageId = resolvedSearchParams?.messageId;
  const messageId = Array.isArray(rawMessageId) ? rawMessageId[0] : rawMessageId;
  const targetMessageId = messageId ? parseInt(messageId, 10) : null;
  const rawRating = resolvedSearchParams?.rating;
  const rating = (Array.isArray(rawRating) ? rawRating[0] : rawRating) as
    | 'up'
    | 'down'
    | 'report'
    | undefined;

  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await api.get(`/admin/chat/${id}`);
        if (!response.ok) throw new Error('Failed to fetch chat session');

        const payload = await response.json();
        const sessionData = payload.session as RawSessionData | null;

        if (!sessionData) {
          setSession(null);
        } else {
          const resolvedProfile = Array.isArray(sessionData.profiles)
            ? (sessionData.profiles[0] ?? null)
            : (sessionData.profiles ?? null);
          const firstName = resolvedProfile?.first_name?.trim() ?? '';
          const otherNames = resolvedProfile?.other_names?.trim() ?? '';
          const displayName =
            [firstName, otherNames].filter(Boolean).join(' ').trim() ||
            (sessionData.user_id ? `User ${sessionData.user_id.slice(0, 8)}` : 'Anonymous User');

          setSession({
            title: sessionData.title,
            created_at: sessionData.created_at,
            user_id: sessionData.user_id,
            display_name: displayName,
            profiles: resolvedProfile,
          });
        }

        setMessages((payload.messages as Message[]) ?? []);
      } catch (error) {
        console.error('Error loading chat:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) void fetchData();
  }, [id]);

  useEffect(() => {
    if (!isLoading && targetMessageId && messages.length > 0) {
      const timeout = setTimeout(() => {
        const element = document.getElementById(`msg-${targetMessageId}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
      return () => clearTimeout(timeout);
    }
    return;
  }, [isLoading, targetMessageId, messages]);

  const getHighlightStyles = () => {
    if (!rating) {
      return {
        badgeBg:
          'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
        ring: 'ring-red-500 shadow-red-500/10',
        icon: AlertTriangle,
        label: 'Reported Message',
      };
    }

    if (rating === 'up') {
      return {
        badgeBg:
          'bg-primary/10 text-primary border-primary/30 dark:bg-primary/20 dark:text-primary dark:border-primary/40',
        ring: 'ring-primary',
        icon: ThumbsUp,
        label: 'Positive Feedback',
      };
    }

    if (rating === 'down') {
      return {
        badgeBg:
          'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
        ring: 'ring-red-500 shadow-red-500/10',
        icon: ThumbsDown,
        label: 'Negative Feedback',
      };
    }

    return {
      badgeBg:
        'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
      ring: 'ring-amber-500',
      icon: AlertTriangle,
      label: 'Reported Message',
    };
  };

  const highlightStyles = getHighlightStyles();
  const BadgeIcon = highlightStyles.icon;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Session not found.</p>
        <Link href="/admin/feedback" className="flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to Feedback
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl animate-in space-y-6 pb-20 fade-in duration-500">
      <div className="sticky top-0 z-20 flex flex-col gap-4 border-b border-border/50 bg-background/95 pb-6 pt-4 backdrop-blur-sm">
        <Link
          href="/admin/feedback"
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Feedback
        </Link>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{session.title || 'Untitled Chat'}</h1>
            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {new Date(session.created_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {new Date(session.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>

          <div className="min-w-[200px] rounded-lg border border-border/50 bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">{session.display_name}</div>
                {(session.profiles?.university || session.profiles?.level) && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[session.profiles?.university, session.profiles?.level].filter(Boolean).join(' • ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 py-4">
        {messages.length === 0 && <div className="py-12 text-center text-muted-foreground">No messages in this conversation.</div>}

        {messages
          .filter((message) => message.role !== 'system')
          .map((message) => {
            const isTarget = message.id === targetMessageId;
            return (
              <div
                key={message.id}
                id={`msg-${message.id}`}
                className={`group flex w-full flex-col transition-all duration-500 ${
                  message.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`mb-1 flex items-center gap-2 px-1 ${
                    message.role === 'user' ? 'mr-1 flex-row-reverse' : 'ml-1'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {message.role === 'user' ? 'User' : 'Assistant'}
                  </div>
                  {isTarget && (
                    <div
                      className={`animate-pulse rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${highlightStyles.badgeBg}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <BadgeIcon className="h-3 w-3" />
                        {highlightStyles.label}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-[15px] leading-relaxed shadow-sm transition-all duration-300 ${
                    isTarget ? `ring-2 ${highlightStyles.ring} ring-offset-2 ring-offset-background` : ''
                  } ${
                    message.role === 'user'
                      ? 'rounded-tr-sm border border-white/5 bg-[#1e293b] text-white dark:bg-[var(--surface-secondary)]'
                      : 'rounded-tl-sm border border-border/50 bg-card text-foreground'
                  }`}
                >
                  {message.image_data && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {getImages(message.image_data).map((image, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={index}
                          src={`data:image/jpeg;base64,${image}`}
                          alt={`Attachment ${index + 1}`}
                          className="max-h-[300px] h-auto max-w-full rounded-lg border border-white/10"
                        />
                      ))}
                    </div>
                  )}

                  <div className="prose prose-sm max-w-none break-words dark:prose-invert">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        a: ({ ...props }) => (
                          <a
                            {...props}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          />
                        ),
                        code: ({ className, children, inline, ...props }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) =>
                          inline ? (
                            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...props}>
                              {children}
                            </code>
                          ) : (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>

                <div className="mt-1 px-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {new Date(message.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            );
          })}
      </div>

      <div className="pb-4 pt-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
          <SquarePen className="h-3 w-3" />
          End of Conversation
        </div>
      </div>
    </div>
  );
}
