'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent } from 'react';
import type { Message } from '@/components/MessageBubble';
import { api } from '@/lib/api';
import { useChatSession } from '@/lib/ChatSessionContext';
import { supabase } from '@/lib/supabase';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import type { MainUser, WebSearchUsage } from '@/components/main/types';
import { PROFILE_UPDATED_EVENT, type ProfileUpdateDetail } from '@/lib/profile-events';
import { WEB_SEARCH_DEFAULT_EVENT, WEB_SEARCH_DEFAULT_KEY } from '@/lib/settings-events';

type FailedRequest =
  | { type: 'send'; text: string; attachments: string[]; isRetry: boolean }
  | { type: 'edit'; messageId: string; newText: string }
  | { type: 'regenerate' }
  | null;

const MAX_IMAGES = 4;
const WEB_SEARCH_FEATURE_ENABLED = false;
// Number of messages shown immediately when a session is opened.
// The rest are fetched in the background and prepended silently.
const INITIAL_MESSAGE_LIMIT = 8;
const OLDER_MESSAGES_BATCH_SIZE = 30;
const OLDER_MESSAGES_LOAD_DELAY_MS = 3000;

let mainBootstrapCache:
  | {
    user: Exclude<MainUser, null>;
    isAdmin: boolean;
    webSearchAvailable: boolean;
    hasSeenWelcome: boolean;
  }
  | null = null;

export function useMainPageController() {
  const router = useRouter();

  const [user, setUser] = useState<MainUser>(null);
  // Initialize with false to prevent the "Loading PansGPT" spinner from
  // flashing during the very first React render frame on cold launch.
  const [authLoading, setAuthLoading] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [webSearchUsage, setWebSearchUsage] = useState<WebSearchUsage>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isWeeklyTimetableOpen, setIsWeeklyTimetableOpen] = useState(false);
  const [isPersonalInfoOpen, setIsPersonalInfoOpen] = useState(false);
  const [isQuizPerformanceOpen, setIsQuizPerformanceOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingBackend, setIsSyncingBackend] = useState(true);
  const [isError, setIsError] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(() => {
    if (!WEB_SEARCH_FEATURE_ENABLED) {
      return false;
    }
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(WEB_SEARCH_DEFAULT_KEY) === 'true';
  });
  const [webSearchAvailable, setWebSearchAvailable] = useState(WEB_SEARCH_FEATURE_ENABLED);
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  // Message queue: holds messages typed while a response is in-flight
  const [messageQueue, setMessageQueue] = useState<Array<{ text: string; attachments: string[] }>>([]);
  const messageQueueRef = useRef<Array<{ text: string; attachments: string[] }>>([]);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [thinkingText, setThinkingText] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    hasLoadedHistory,
    fetchHistory,
    loadSession,
    createSession,
  } = useChatSession();
  const { loadOlderMessages } = useChatHistory();

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamFullTextRef = useRef('');
  const streamThinkingTextRef = useRef(''); // accumulates thinking_update / thinking_delta text between resets
  const wasEarlyStopRef = useRef(false); // true if stopped before AI started streaming
  const streamStatusRef = useRef('processing');
  const isCreatingSessionRef = useRef(false);
  const lastFailedRequestRef = useRef<FailedRequest>(null);
  const isUserScrolledUpRef = useRef(false);
  const isLoadingOlderRef = useRef(false);
  const messagesRef = useRef<Message[]>([]); // changed: mirror the latest message list so older-message pagination can stay callback-stable
  // changed: hasOlderMessagesRef removed — IntersectionObserver in MainConversation gates the call externally
  const prevMessagesLengthRef = useRef(0);
  const voiceBaseInputRef = useRef('');
  const inputMessageRef = useRef(inputMessage);

  const {
    isListening,
    isStarting,
    isProcessing,
    transcript,
    interimTranscript,
    volume,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceInput();

  const fetchWebSearchUsage = useCallback(async () => {
    if (!WEB_SEARCH_FEATURE_ENABLED) {
      setWebSearchUsage(null);
      return;
    }
    try {
      const response = await api.get('/web-search/usage');
      if (response.ok) {
        const data = await response.json();
        setWebSearchUsage(data);
      }
    } catch { }
  }, []);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setUser(null);
        setAuthLoading(false);
        router.replace('/login');
        return;
      }

      const { id, email, user_metadata: userMetadata } = session.user;

      // OPTIMISTIC RENDER: Populate user instantly from Supabase session metadata.
      // This allows us to drop the "Loading PansGPT..." spinner instantly so the 
      // Sidebar and Chat structure map out immediately.
      const optimisticUser = {
        id,
        email: email || '',
        name: userMetadata?.full_name || '',
        avatarUrl: userMetadata?.avatar_url || '',
        level: userMetadata?.level || '',
        university: userMetadata?.university || '',
        subscriptionTier: 'free',
      };

      const isWelcomeFlow = new URLSearchParams(window.location.search).get('welcome') === 'true';

      if (mainBootstrapCache?.user.id === id && !isWelcomeFlow) {
        // Fast path: fully cached memory layer
        setUser(mainBootstrapCache.user);
        setIsAdmin(mainBootstrapCache.isAdmin);
        setWebSearchAvailable(WEB_SEARCH_FEATURE_ENABLED && mainBootstrapCache.webSearchAvailable);
        setAuthLoading(false);
        setIsSyncingBackend(false);
      } else {
        // Drop the "Loading PansGPT..." spinner instantly!
        setUser(optimisticUser);
        setAuthLoading(false);

        // Run the real network fetches silently in the background
        try {
          setIsSyncingBackend(true);
          const bootstrapResponse = await api.get('/me/bootstrap');
          const bootstrap = bootstrapResponse.ok ? await bootstrapResponse.json() : null;
          const profile = bootstrap?.profile;

          const nextUser = {
            id,
            email: email || '',
            name:
              profile?.full_name ||
              [profile?.first_name, profile?.other_names].filter(Boolean).join(' ').trim() ||
              optimisticUser.name,
            avatarUrl: profile?.avatar_url || optimisticUser.avatarUrl,
            level: profile?.level || optimisticUser.level,
            university: profile?.university || optimisticUser.university,
            subscriptionTier: profile?.subscription_tier || 'free',
          };

          mainBootstrapCache = {
            user: nextUser,
            isAdmin: Boolean(bootstrap?.is_admin),
            webSearchAvailable: WEB_SEARCH_FEATURE_ENABLED && (bootstrap?.system_settings?.web_search_enabled ?? true),
            hasSeenWelcome: Boolean(profile?.has_seen_welcome),
          };

          // Silently upgrade the UI with the final database values
          setUser(nextUser);
          setIsAdmin(mainBootstrapCache.isAdmin);
          setWebSearchAvailable(mainBootstrapCache.webSearchAvailable);

          const pendingWelcome = window.localStorage.getItem('pansgpt-show-welcome') === 'true';

          if (isWelcomeFlow) {
            window.localStorage.setItem('pansgpt-show-welcome', 'true');
            window.history.replaceState({}, '', '/main');
          }

          if ((isWelcomeFlow || pendingWelcome || !profile?.has_seen_welcome)) {
            window.localStorage.removeItem('pansgpt-show-welcome');
            setShowWelcomeModal(true);
            api.patch('/me/profile', { has_seen_welcome: true }).catch(() => {});
            if (mainBootstrapCache) {
              mainBootstrapCache.hasSeenWelcome = true;
            }
          }
        } catch (err) {
          console.error("Failed to sync backend user data silently:", err);
        } finally {
          setIsSyncingBackend(false);
        }
      }

      // Fetch usage stats silently in the background
      fetchWebSearchUsage().catch(() => {});
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        mainBootstrapCache = null;
        setUser(null);
        setAuthLoading(false);
        router.replace('/login');
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleWebSearchDefaultUpdated = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail;
      if (WEB_SEARCH_FEATURE_ENABLED && typeof enabled === 'boolean') {
        setIsWebSearchEnabled(enabled);
      }
    };

    window.addEventListener(WEB_SEARCH_DEFAULT_EVENT, handleWebSearchDefaultUpdated as EventListener);
    return () => window.removeEventListener(WEB_SEARCH_DEFAULT_EVENT, handleWebSearchDefaultUpdated as EventListener);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WEB_SEARCH_DEFAULT_KEY, String(WEB_SEARCH_FEATURE_ENABLED && isWebSearchEnabled));
  }, [isWebSearchEnabled]);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ProfileUpdateDetail>).detail;
      if (!detail) {
        return;
      }

      setUser((previous) =>
        previous
          ? {
            ...previous,
            name: detail.name ?? previous.name,
            avatarUrl: detail.avatarUrl ?? previous.avatarUrl,
            level: detail.level ?? previous.level,
            university: detail.university ?? previous.university,
            subscriptionTier: detail.subscriptionTier ?? previous.subscriptionTier,
          }
          : previous
      );
      if (mainBootstrapCache?.user) {
        mainBootstrapCache = {
          ...mainBootstrapCache,
          user: {
            ...mainBootstrapCache.user,
            name: detail.name ?? mainBootstrapCache.user.name,
            avatarUrl: detail.avatarUrl ?? mainBootstrapCache.user.avatarUrl,
            level: detail.level ?? mainBootstrapCache.user.level,
            university: detail.university ?? mainBootstrapCache.user.university,
            subscriptionTier: detail.subscriptionTier ?? mainBootstrapCache.user.subscriptionTier,
          },
        };
      }
    };

    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (user && !hasLoadedHistory && sessions.length === 0) {
      void fetchHistory();
    }
  }, [fetchHistory, hasLoadedHistory, sessions.length, user]);

  useEffect(() => {
    if ((webSearchUsage?.remaining ?? 1) <= 0) {
      setIsWebSearchEnabled(false);
    }
  }, [webSearchUsage?.remaining]);

  const consumeSSEStream = async (
    response: Response,
    assistantTempId: string,
    onUserMessageId?: (id: string) => void
  ): Promise<string | null> => {
    if (!response.body) {
      throw new Error('Streaming not supported by response body');
    }

    streamFullTextRef.current = '';
    streamStatusRef.current = 'processing';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalAssistantMessageId: string | null = null;
    let finalCitations: Array<{ title?: string; course?: string; lecturer?: string }> = [];
    let saveFailed = false;
    let saveFailedSessionId: string | null = null;
    let saveFailedText: string | null = null;

    const updateStreamingStatus = (status: string) => {
      streamStatusRef.current = status;
      setMessages((previous) =>
        previous.map((message) =>
          String(message.id) === assistantTempId
            ? { ...message, status, isThinking: true }
            : message
        )
      );
    };

    const updateUIWithChunk = (newText: string) => {
      streamFullTextRef.current += newText;
      setMessages((previous) =>
        previous.map((message) =>
          String(message.id) === assistantTempId
            ? { ...message, content: streamFullTextRef.current, isThinking: false, status: streamStatusRef.current }
            : message
        )
      );
    };

    const handleRawEvent = (rawEvent: string) => {
      if (!rawEvent) {
        return;
      }

      const dataLines = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

      const payload = dataLines.join('\n');
      if (!payload || payload === '[DONE]') {
        return;
      }

      try {
        const parsed = JSON.parse(payload);

        if (parsed?.user_message_id) {
          const realUserMessageId = String(parsed.user_message_id);
          setMessages((previous) => {
            const nextMessages = [...previous];
            for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
              if (nextMessages[index].role === 'user') {
                nextMessages[index] = { ...nextMessages[index], id: realUserMessageId };
                break;
              }
            }
            return nextMessages;
          });
          onUserMessageId?.(realUserMessageId);
        }

        if (typeof parsed?.status === 'string' && parsed.status.length > 0) {
          updateStreamingStatus(parsed.status);
        }

        if (typeof parsed?.delta === 'string' && parsed.delta.length > 0) {
          updateUIWithChunk(parsed.delta);
        }

        // thinking_update: planner public-thought narrative (streamed before RAG/final answer)
        if (typeof parsed?.thinking_update === 'string' && parsed.thinking_update.length > 0) {
          streamThinkingTextRef.current += parsed.thinking_update;
          setThinkingText((prev) => prev + parsed.thinking_update);
          setIsThinking(true);
        }

        // thinking_delta: raw native model reasoning — DISCARD SILENTLY.
        // The backend no longer emits this. If it ever arrives (legacy or regression),
        // do NOT accumulate, display, or save it. Native <think> content is backend-only.
        // (defensive no-op — intentionally empty)

        if (parsed?.thinking_done === true) {
          setIsThinking(false);
        }

        if (parsed?.message_id) {
          finalAssistantMessageId = String(parsed.message_id);
        }

        if (parsed?.done === true) {
          if (parsed?.message_id) {
            finalAssistantMessageId = String(parsed.message_id);
          }
          if (Array.isArray(parsed?.citations)) {
            finalCitations = parsed.citations;
          }
          if (parsed?.save_failed === true) {
            saveFailed = true;
            saveFailedSessionId = parsed?.session_id || null;
            saveFailedText = parsed?.full_text || null;
          }
        }
      } catch {
        updateUIWithChunk(payload);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let eventBoundary = buffer.indexOf('\n\n');
      while (eventBoundary !== -1) {
        const rawEvent = buffer.slice(0, eventBoundary).trim();
        buffer = buffer.slice(eventBoundary + 2);
        handleRawEvent(rawEvent);
        eventBoundary = buffer.indexOf('\n\n');
      }
    }

    if (buffer.trim()) {
      handleRawEvent(buffer.trim());
    }

    const finalAssistantText = streamFullTextRef.current;
    setMessages((previous) =>
      previous.map((message) =>
        String(message.id) === assistantTempId
          ? { ...message, content: finalAssistantText, isThinking: false, citations: finalCitations, status: streamStatusRef.current }
          : message
      )
    );

    if (saveFailed && saveFailedSessionId && saveFailedText) {
      try {
        const fallbackResponse = await api.fetch('/chat/save-partial', {
          method: 'POST',
          body: JSON.stringify({ session_id: saveFailedSessionId, content: saveFailedText }),
        });
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          if (fallbackData?.message_id) {
            finalAssistantMessageId = String(fallbackData.message_id);
            setMessages((previous) =>
              previous.map((message) =>
                String(message.id) === assistantTempId
                  ? { ...message, id: String(fallbackData.message_id) }
                  : message
              )
            );
          }
        }
      } catch (fallbackError) {
        console.error('[Fallback] Failed to save message via fallback:', fallbackError);
      }
    }

    return finalAssistantMessageId;
  };

  useEffect(() => {
    inputMessageRef.current = inputMessage;
  }, [inputMessage]);

  useEffect(() => {
    messagesRef.current = messages; // changed: keep the stable messages ref synchronized with the latest rendered history
  }, [messages]); // changed: update the mirror ref whenever chat messages change

  // changed: hasOlderMessages sync effect removed — ref eliminated, observer in MainConversation handles the gate

  useEffect(() => {
    if (!transcript && !interimTranscript) {
      return;
    }

    const base = voiceBaseInputRef.current;
    const spoken = `${transcript}${interimTranscript}`.trimStart();
    const spacer = base.trim().length > 0 && spoken.length > 0 ? ' ' : '';
    setInputMessage(`${base}${spacer}${spoken}`.trimStart());
  }, [interimTranscript, transcript]);

  const scrollToBottom = useCallback((smooth = true) => {
    if (smooth) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const element = chatScrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const isNewMessageAdd = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;
    if (isUserScrolledUpRef.current) {
      return;
    }
    if (isNewMessageAdd && !isLoadingOlder) {
      scrollToBottom(true);
      return;
    }
    if (isLoading) {
      scrollToBottom(false);
    }
  }, [isLoading, isLoadingOlder, messages, scrollToBottom]);

  const handleScrollStateChange = useCallback((isScrolledUp: boolean) => {
    isUserScrolledUpRef.current = isScrolledUp;
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 44), 200)}px`;
    }
  }, [inputMessage]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedMessages((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleNewChat = useCallback(() => {
    isUserScrolledUpRef.current = false;
    setMessages([]);
    setActiveSessionId(null);
    setInputMessage('');
    setPendingAttachments([]);
    setIsError(false);
    setChatError(null);
  }, [setActiveSessionId]);

  const handleLoadSession = useCallback(
    async (id: string) => {
      isUserScrolledUpRef.current = false;
      setIsLoadingChat(true);
      try {
        // Phase 1: fetch the 8 most recent messages - shows instantly
        const recent = await loadSession(id, INITIAL_MESSAGE_LIMIT);
        setMessages(recent as Message[]);
        setActiveSessionId(id);
        setIsError(false);
        setChatError(null);
        // Signal there may be older messages (we'll know for sure after background load)
        setHasOlderMessages(recent.length >= INITIAL_MESSAGE_LIMIT);
      } finally {
        setIsLoadingChat(false);
      }

      requestAnimationFrame(() => { // changed: wait for React to commit the session messages to the DOM
        requestAnimationFrame(() => { // changed: wait one more frame so the browser paints and computes final scrollHeight
          isUserScrolledUpRef.current = false; // changed: re-assert auto-scroll eligibility after the passive scroll listener may have flipped it
          scrollToBottom(false); // changed: snap instantly to the bottom when a session opens
        }); // changed: close post-paint session-open scroll pass
      }); // changed: defer bottom snap until the message list exists in layout
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadSession] // changed: removed loadSessionFull because session open no longer performs background full-history preload
  );

  // Keep a stable ref to handleLoadSession so the effect below only fires
  // when activeSessionId changes — NOT when the callback identity changes.
  const handleLoadSessionRef = useRef(handleLoadSession);
  useEffect(() => { handleLoadSessionRef.current = handleLoadSession; }, [handleLoadSession]);

  useEffect(() => {
    if (activeSessionId) {
      if (isCreatingSessionRef.current) {
        isCreatingSessionRef.current = false;
        return;
      }
      void handleLoadSessionRef.current(activeSessionId);
    } else {
      setMessages([]);
      setIsError(false);
      setChatError(null);
    }
  // Only re-run when activeSessionId changes — NOT when the callback identity changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (
      !activeSessionId || // changed: skip when there is no active chat session
      isLoadingOlderRef.current || // changed: use ref-only loading guard so state flips do not affect callback identity
      messagesRef.current.length === 0 // changed: use mirrored messages ref for stable callback reads
    ) {
      return; // changed: hasOlderMessages check removed — IntersectionObserver gate handles it externally
    }

    isLoadingOlderRef.current = true;
    setIsLoadingOlder(true);
    try {
      await new Promise((resolve) => {
        window.setTimeout(resolve, OLDER_MESSAGES_LOAD_DELAY_MS); // changed: 600ms UX delay before fetching
      });

      const oldestMessage = messagesRef.current[0] as Message & { created_at?: string }; // changed: read oldest from stable ref, not state
      const beforeCursor = oldestMessage?.created_at;

      if (!beforeCursor) {
        setHasOlderMessages(false);
        return;
      }

      const olderMessages = await loadOlderMessages(activeSessionId, beforeCursor, OLDER_MESSAGES_BATCH_SIZE);
      if (olderMessages.length === 0) {
        setHasOlderMessages(false);
      } else {
        // changed: NO scroll math here — DOM anchoring moved to useLayoutEffect in MainConversation
        setMessages((previous) => [...(olderMessages as Message[]), ...previous]);
        setHasOlderMessages(olderMessages.length >= OLDER_MESSAGES_BATCH_SIZE);
      }
    } finally {
      isLoadingOlderRef.current = false; // changed: always reset ref guard
      setIsLoadingOlder(false); // changed: always reset loading state
    }
  }, [activeSessionId, loadOlderMessages]); // changed: dep array — all guards are refs, no state deps

  const friendlyErrorMessage = (status: number): string => {
    switch (status) {
      case 401: return "Your session has expired. Please log in again.";
      case 403: return "You don't have permission to do that.";
      case 429: return "You're sending messages too fast. Please wait a moment.";
      case 500: return "Something went wrong on our end. Please try again.";
      case 503: return "The service is temporarily unavailable. Please try again shortly.";
      default: return "Something went wrong. Please try again.";
    }
  };

  const extractApiErrorMessage = (errorBody: unknown, fallback: string, status?: number): string => {
    // For auth/server errors, always show a friendly message — never expose raw backend strings
    if (status && [401, 403, 500, 503].includes(status)) {
      return friendlyErrorMessage(status);
    }
    if (!errorBody || typeof errorBody !== 'object') {
      return status ? friendlyErrorMessage(status) : fallback;
    }
    const payload = errorBody as Record<string, unknown>;
    // Only surface backend message for user-actionable errors (4xx except auth)
    if (status && status >= 400 && status < 500 && status !== 401 && status !== 403) {
      const raw =
        (typeof payload.detail === 'string' && payload.detail.trim()) ||
        (typeof payload.message === 'string' && payload.message.trim()) ||
        '';
      if (raw) return raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
    }
    return status ? friendlyErrorMessage(status) : fallback;
  };

  const sendMessageApi = useCallback(
    async (text: string, attachments: string[] = [], isRetry = false) => {
      setIsLoading(true);
      setIsError(false);
      setChatError(null);
      lastFailedRequestRef.current = null;
      streamFullTextRef.current = '';
      streamThinkingTextRef.current = '';
      wasEarlyStopRef.current = false;
      setThinkingText('');
      setIsThinking(false);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const tempUserId = `temp-user-${Date.now()}`;
      const tempAssistantId = `temp-assistant-${Date.now()}`;

      try {
        let currentSessionId = activeSessionId;

        const newUserMessage: Message = {
          id: tempUserId,
          role: 'user',
          content: text,
          session_id: currentSessionId || undefined,
          ...(attachments.length > 0 && {
            imageBase64: attachments[0],
            images: attachments, // all images for multi-image bubble display
          }),
        };
        const assistantPlaceholder: Message = {
          id: tempAssistantId,
          role: 'assistant',
          content: '',
          session_id: currentSessionId || undefined,
          isThinking: true,
          status: 'processing',
        };

        let nextBaseMessages = [...messages];
        if (!isRetry) {
          const lastMessage = nextBaseMessages[nextBaseMessages.length - 1];
          const lastMessageIsReplaceableAssistant =
            lastMessage?.role === 'assistant' &&
            (lastMessage.isStopped === true || lastMessage.content === '');

          if (lastMessageIsReplaceableAssistant) {
            const isEarlyStop = wasEarlyStopRef.current || !lastMessage.content;
            wasEarlyStopRef.current = false;

            if (isEarlyStop) {
              nextBaseMessages = nextBaseMessages.slice(0, -1);
              const prevMsg = nextBaseMessages[nextBaseMessages.length - 1];
              if (prevMsg?.role === 'user') {
                // MUST await — fire-and-forget races with /chat saving the new user
                // message and truncate deletes it instead of the orphan
                if (currentSessionId) {
                  try {
                    await api.fetch('/chat/truncate-last-stopped', {
                      method: 'POST',
                      body: JSON.stringify({ session_id: currentSessionId }),
                    });
                  } catch (e) {
                    console.warn('[Truncate] cleanup failed:', e);
                  }
                }
                nextBaseMessages = nextBaseMessages.slice(0, -1);
              }
            }
          } else if (isError) {
            const previousMessage = nextBaseMessages[nextBaseMessages.length - 1];
            if (previousMessage?.role === 'user') {
              nextBaseMessages = nextBaseMessages.slice(0, -1);
            }
          }
        }

        const updatedHistory = isRetry ? [...messages] : [...nextBaseMessages, newUserMessage];
        setMessages((previous) =>
          isRetry
            ? [...previous, assistantPlaceholder]
            : [...nextBaseMessages, newUserMessage, assistantPlaceholder]
        );

        if (!currentSessionId) {
          const newSession = await createSession('New Chat');
          if (newSession) {
            currentSessionId = newSession.id;
            isCreatingSessionRef.current = true;
            setActiveSessionId(newSession.id);
            // Update message references with the new session ID
            newUserMessage.session_id = currentSessionId || undefined;
            assistantPlaceholder.session_id = currentSessionId || undefined;
          }
          if (!currentSessionId) {
            throw new Error('Could not create chat session. Please retry.');
          }
        }

        const payload = {
          text,
          mode: 'chat',
          messages: updatedHistory,
          images: attachments.map((base64Data) => base64Data),
          session_id: currentSessionId,
          is_retry: isRetry,
          web_search: WEB_SEARCH_FEATURE_ENABLED && isWebSearchEnabled,
          thinking_mode: thinkingMode,
        };

        const response = await api.fetch('/chat', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const status = response.status;
          let detail = friendlyErrorMessage(status);
          try {
            const errorData = await response.json();
            detail = extractApiErrorMessage(errorData, detail, status);
          } catch { }
          throw new Error(detail);
        }

        const finalAssistantMessageId = await consumeSSEStream(
          response,
          tempAssistantId,
          !isRetry
            ? (userMessageId: string) => {
              setMessages((previous) =>
                previous.map((message) =>
                  String(message.id) === tempUserId ? { ...message, id: userMessageId } : message
                )
              );
            }
            : undefined
        );

        void fetchHistory(undefined, true);

        if (finalAssistantMessageId) {
          setMessages((previous) =>
            previous.map((message) =>
              String(message.id) === tempAssistantId
                ? { ...message, id: finalAssistantMessageId }
                : message
            )
          );
        }
        await fetchWebSearchUsage();
        lastFailedRequestRef.current = null;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          setMessages((previous) =>
            previous.map((message) =>
              String(message.id) === tempAssistantId
                ? { ...message, content: streamFullTextRef.current, isThinking: false, isStopped: true, status: streamStatusRef.current }
                : message
            )
          );
        } else {
          console.error('Chat Error:', error);
          setMessages((previous) => previous.filter((message) => String(message.id) !== tempAssistantId));
          setIsError(true);
          setChatError(error instanceof Error && error.message.length < 120 ? error.message : 'Something went wrong. Please try again.');
          lastFailedRequestRef.current = { type: 'send', text, attachments, isRetry };
          // Restore message to input so user doesn't lose it
          setInputMessage(text);
          if (attachments.length > 0) setPendingAttachments(attachments);
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [activeSessionId, createSession, fetchHistory, fetchWebSearchUsage, isError, isWebSearchEnabled, messages, setActiveSessionId]
  );

  const handleSendMessage = useCallback((overrideText?: string) => {
    const textToUse = typeof overrideText === 'string' ? overrideText : inputMessage;
    if (!textToUse.trim() && pendingAttachments.length === 0) return;
    const messageText = textToUse.trim();
    const attachments = [...pendingAttachments];
    
    if (typeof overrideText !== 'string') {
      setInputMessage('');
    }
    setPendingAttachments([]);

    if (isLoading || isSyncingBackend) {
      // Queue the message for after the current response finishes or sync completes
      const queued = { text: messageText, attachments };
      messageQueueRef.current = [...messageQueueRef.current, queued];
      setMessageQueue([...messageQueueRef.current]);
      return;
    }

    void sendMessageApi(messageText, attachments);
  }, [inputMessage, isLoading, isSyncingBackend, pendingAttachments, sendMessageApi, setInputMessage]);

  // Drain the queue: when isLoading goes false and there are queued messages, send the next one
  useEffect(() => {
    if (isLoading || isSyncingBackend || messageQueueRef.current.length === 0) return;
    const next = messageQueueRef.current[0];
    messageQueueRef.current = messageQueueRef.current.slice(1);
    setMessageQueue([...messageQueueRef.current]);
    void sendMessageApi(next.text, next.attachments);
  // Only re-run when isLoading/isSyncingBackend changes — sendMessageApi is stable via useCallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isSyncingBackend]);

  const handleStopGeneration = useCallback(() => {
    // Track whether any text was streamed before the stop
    wasEarlyStopRef.current = !streamFullTextRef.current.trim();
    abortControllerRef.current?.abort();
    // Immediately reset loading so the stop button reverts to the send icon right away.
    setIsLoading(false);

    const partialText = streamFullTextRef.current.trim();
    const sessionId = activeSessionId;
    if (!sessionId) return;

    // For mid-stream stops: wait 800ms for backend disconnect handler to save first,
    // then call save-partial as fallback (it will UPDATE the existing row, not INSERT).
    // For early stops: no save needed here — cleanup happens in sendMessageApi on next send.
    if (!wasEarlyStopRef.current && partialText) {
      setTimeout(() => {
        api.fetch('/chat/save-partial', {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId, content: partialText }),
        }).catch(e => console.warn('[Stop] save-partial failed:', e));
      }, 800);
    }
  }, [activeSessionId]);


  const handleEditMessage = useCallback(
    async (messageId: string, newText: string) => {
      if (!activeSessionId) {
        return;
      }

      const tempAssistantId = `temp-assistant-edit-${Date.now()}`;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      lastFailedRequestRef.current = null;
      streamFullTextRef.current = '';
      setThinkingText('');
      setIsThinking(false);
      streamThinkingTextRef.current = '';

      const editIndex = messages.findIndex((message) => String(message.id) === String(messageId));
      const targetMessageId = editIndex !== -1 ? String(messages[editIndex].id) : String(messageId);

      // If it's a temp ID, skip the optimistic update entirely —
      // we'll clean up and send fresh so there's no disappear/reappear flash
      if (!targetMessageId.startsWith('temp-') && editIndex !== -1) {
        // Strip any trailing stopped/empty assistant bubble so the optimistic
        // slice doesn't cause it to flash away and immediately reappear.
        const baseMessages = messages.slice(0, editIndex + 1);
        const lastBefore = messages[editIndex + 1];
        const trailingStoppedBubble =
          lastBefore?.role === 'assistant' &&
          (lastBefore.isStopped === true || lastBefore.content === '');
        const optimisticMessages = trailingStoppedBubble
          ? baseMessages  // stopped bubble already excluded by the slice
          : baseMessages;
        optimisticMessages[editIndex] = {
          ...optimisticMessages[editIndex],
          content: newText,
        };
        optimisticMessages.push({
          id: tempAssistantId,
          role: 'assistant',
          content: '',
          session_id: activeSessionId,
          isThinking: true,
          status: 'processing',
        });
        setMessages(optimisticMessages);
      }

      setEditingMessageId(null);
      setEditDraft('');
      setIsLoading(true);
      setIsError(false);

      try {
        const targetMessage = messages.find(
          (message) => String(message.id) === String(messageId) && message.role === 'user'
        );
        // targetMessageId already computed above for optimistic update check
        const resolvedTargetId = targetMessage?.id ? String(targetMessage.id) : targetMessageId;

        // If message still has a temp ID (stopped before AI started — SSE user_message_id never arrived)
        // the backend has no record of this ID. Route as a fresh send instead of edit.
        if (resolvedTargetId.startsWith('temp-')) {
          // Update the orphan user message content in place — no flash/disappear
          setMessages((previous) => previous.map((m) =>
            String(m.id) === resolvedTargetId
              ? { ...m, content: newText }
              : m
          ));
          setIsLoading(false);
          abortControllerRef.current = null;
          // Clean up orphan from DB then send as new message.
          // await truncate first (race: fire-and-forget can delete the new message instead).
          if (activeSessionId) {
            try {
              await api.fetch('/chat/truncate-last-stopped', {
                method: 'POST',
                body: JSON.stringify({ session_id: activeSessionId }),
              });
            } catch { /* non-fatal */ }
          }
          // await one microtask so React flushes setIsLoading(false) before
          // sendMessageApi reads isLoading — otherwise the guard fires and
          // the send is silently dropped.
          await Promise.resolve();
          void sendMessageApi(newText, []);
          return;
        }

        let editImages: string[] | undefined;
        if (targetMessage) {
          const parsedBackendImages =
            typeof targetMessage.image_data === 'string' && targetMessage.image_data
              ? (() => {
                try {
                  const parsed = JSON.parse(targetMessage.image_data);
                  return Array.isArray(parsed) ? parsed.filter((img): img is string => typeof img === 'string' && img.length > 0) : [targetMessage.image_data];
                } catch {
                  return [targetMessage.image_data];
                }
              })()
              : [];
          const combinedImages = [...(targetMessage.images || []), ...parsedBackendImages];
          if (targetMessage.imageBase64) {
            combinedImages.push(targetMessage.imageBase64);
          }
          const uniqueImages = [...new Set(combinedImages.filter((img): img is string => typeof img === 'string' && img.length > 0))];
          if (uniqueImages.length > 0) {
            editImages = uniqueImages;
          }
        }
        const response = await api.fetch('/chat/edit', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            session_id: activeSessionId,
            message_id: resolvedTargetId,
            new_text: newText,
            thinking_mode: thinkingMode,
            ...(editImages ? { images: editImages } : {}),
          }),
        });

        if (!response.ok) {
          throw new Error(`Edit failed: ${response.status}`);
        }

        const finalAssistantMessageId = await consumeSSEStream(response, tempAssistantId, (newUserMessageId: string) => {
          setMessages((previous) =>
            previous.map((message) =>
              String(message.id) === String(resolvedTargetId)
                ? { ...message, id: newUserMessageId }
                : message
            )
          );
        });

        if (finalAssistantMessageId) {
          setMessages((previous) =>
            previous.map((message) =>
              String(message.id) === tempAssistantId
                ? { ...message, id: String(finalAssistantMessageId) }
                : message
            )
          );
        }
        lastFailedRequestRef.current = null;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          setMessages((previous) =>
            previous.map((message) =>
              String(message.id) === tempAssistantId
                ? { ...message, content: streamFullTextRef.current, isThinking: false, isStopped: true, status: streamStatusRef.current }
                : message
            )
          );
          // Persist partial text on edit abort (same guarantee as regular send)
          if (activeSessionId) {
            api.fetch('/chat/save-partial', {
              method: 'POST',
              body: JSON.stringify({ session_id: activeSessionId, content: streamFullTextRef.current.trim() }),
            }).catch(e => console.warn('[Stop/Edit] save-partial failed:', e));
          }
        } else {
          console.error('Edit Error:', error);
          setMessages((previous) => previous.filter((message) => String(message.id) !== tempAssistantId));
          setIsError(true);
          setChatError('Something went wrong. Please try again.');
          lastFailedRequestRef.current = { type: 'edit', messageId: String(messageId), newText };
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [activeSessionId, messages, thinkingMode, sendMessageApi]
  );

  const handleRegenerate = useCallback(async () => {
    if (!activeSessionId) {
      return;
    }

    const tempAssistantId = `temp-assistant-regen-${Date.now()}`;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    lastFailedRequestRef.current = null;
    streamFullTextRef.current = '';
    setThinkingText('');
    setIsThinking(false);
    streamThinkingTextRef.current = '';

    setMessages((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const lastMessage = previous[previous.length - 1];
      const baseMessages =
        lastMessage.role === 'assistant' || lastMessage.role === 'ai' ? previous.slice(0, -1) : previous;
      return [
        ...baseMessages,
        { id: tempAssistantId, role: 'assistant', content: '', session_id: activeSessionId, isThinking: true, status: 'processing' },
      ];
    });
    setIsLoading(true);

    try {
      const response = await api.fetch(`/chat/${activeSessionId}/regenerate`, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          thinking_mode: thinkingMode,
        }),
      });

      if (!response.ok) {
        throw new Error(`Regenerate failed: ${response.status}`);
      }

      const finalAssistantMessageId = await consumeSSEStream(response, tempAssistantId);
      if (finalAssistantMessageId) {
        setMessages((previous) =>
          previous.map((message) =>
            String(message.id) === tempAssistantId
              ? { ...message, id: String(finalAssistantMessageId) }
              : message
          )
        );
      }
      lastFailedRequestRef.current = null;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessages((previous) =>
          previous.map((message) =>
            String(message.id) === tempAssistantId
              ? { ...message, content: streamFullTextRef.current, isThinking: false, isStopped: true, status: streamStatusRef.current }
              : message
          )
        );
        // Persist partial text on regenerate abort
        if (activeSessionId) {
          api.fetch('/chat/save-partial', {
            method: 'POST',
            body: JSON.stringify({ session_id: activeSessionId, content: streamFullTextRef.current.trim() }),
          }).catch(e => console.warn('[Stop/Regenerate] save-partial failed:', e));
        }
      } else {
        console.error('Regenerate failed:', error);
        setMessages((previous) => previous.filter((message) => String(message.id) !== tempAssistantId));
        setIsError(true);
        setChatError('Something went wrong. Please try again.');
        lastFailedRequestRef.current = { type: 'regenerate' };
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [activeSessionId, thinkingMode]);

  const handleRetryFailure = useCallback(() => {
    const lastFailed = lastFailedRequestRef.current;
    if (!lastFailed || isLoading) {
      return;
    }

    setIsError(false);
    setChatError(null);

    if (lastFailed.type === 'send') {
      void sendMessageApi(lastFailed.text, lastFailed.attachments, true);
      return;
    }
    if (lastFailed.type === 'edit') {
      void handleEditMessage(lastFailed.messageId, lastFailed.newText);
      return;
    }
    if (lastFailed.type === 'regenerate') {
      void handleRegenerate();
    }
  }, [handleEditMessage, handleRegenerate, isLoading, sendMessageApi]);

  const handleFileUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        const newSelectedFiles = Array.from(event.target.files).filter((file) => file.type.startsWith('image/'));
        const totalImages = pendingAttachments.length + newSelectedFiles.length;
        if (totalImages > MAX_IMAGES) {
          alert('You can only attach up to 4 images per message.');
        }
        const acceptedFiles = newSelectedFiles.slice(0, Math.max(0, MAX_IMAGES - pendingAttachments.length));
        acceptedFiles.forEach((file) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            setPendingAttachments((previous) => [...previous, (reader.result as string).split(',')[1]]);
          };
          reader.readAsDataURL(file);
        });
      }
      event.target.value = '';
    },
    [pendingAttachments.length]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData.items;
      for (let index = 0; index < items.length; index += 1) {
        if (items[index].type.indexOf('image') !== -1) {
          event.preventDefault();
          const file = items[index].getAsFile();
          if (file) {
            if (pendingAttachments.length >= MAX_IMAGES) {
              alert('You can only attach up to 4 images per message.');
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              setPendingAttachments((previous) => [...previous, (reader.result as string).split(',')[1]]);
            };
            reader.readAsDataURL(file);
          }
        }
      }
    },
    [pendingAttachments.length]
  );

  const handleVoiceToggle = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (isProcessing || isStarting) {
        return;
      }
      if (isListening) {
        stopListening();
        return;
      }
      voiceBaseInputRef.current = inputMessageRef.current;
      resetTranscript();
      void startListening();
    },
    [isListening, isProcessing, isStarting, resetTranscript, startListening, stopListening]
  );

  const updateUserProfile = useCallback((data: { name?: string; level?: string; university?: string; avatarUrl?: string }) => {
    setUser((previous) =>
      previous
        ? {
          ...previous,
          name: data.name ?? previous.name,
          level: data.level ?? previous.level,
          university: data.university ?? previous.university,
          avatarUrl: data.avatarUrl ?? previous.avatarUrl,
        }
        : previous
    );
    if (mainBootstrapCache?.user) {
      mainBootstrapCache = {
        ...mainBootstrapCache,
        user: {
          ...mainBootstrapCache.user,
          name: data.name ?? mainBootstrapCache.user.name,
          level: data.level ?? mainBootstrapCache.user.level,
          university: data.university ?? mainBootstrapCache.user.university,
          avatarUrl: data.avatarUrl ?? mainBootstrapCache.user.avatarUrl,
        },
      };
    }
    setIsPersonalInfoOpen(false);
  }, []);

  const hasMessages = messages.filter((message) => message.role !== 'system').length > 0;

  return {
    activeSessionId,
    authLoading,
    chatEndRef,
    chatError,
    chatScrollRef,
    editDraft,
    editingMessageId,
    expandedMessages,
    fileInputRef,
    handleEditMessage,
    handleFileUpload,
    handleLoadOlderMessages,
    handleNewChat,
    handlePaste,
    handleRegenerate,
    handleRetryFailure,
    handleScrollStateChange,
    handleSendMessage,
    handleStopGeneration,
    handleVoiceToggle,
    hasMessages,
    hasOlderMessages,
    inputMessage,
    isAdmin,
    isError,
    isListening,
    isLoading,
    isLoadingChat,
    isLoadingOlder,
    isPersonalInfoOpen,
    isProcessing,
    isProfileOpen,
    isQuizPerformanceOpen,
    isStarting,
    isWebSearchEnabled,
    isWeeklyTimetableOpen,
    maxImages: MAX_IMAGES,
    messages,
    pendingAttachments,
    removeAttachment: (index: number) =>
      setPendingAttachments((previous) => previous.filter((_, attachmentIndex) => attachmentIndex !== index)),
    selectedImage,
    sessions,
    setEditDraft,
    setEditingMessageId,
    setInputMessage,
    setIsPersonalInfoOpen,
    setIsProfileOpen,
    setIsQuizPerformanceOpen,
    setIsWeeklyTimetableOpen,
    setSelectedImage,
    setShowWelcomeModal,
    setWebSearchEnabled: setIsWebSearchEnabled,
    setPendingAttachments,
    showWelcomeModal,
    textareaRef,
    toggleExpand,
    toggleProfile: () => setIsProfileOpen((previous) => !previous),
    updateUserProfile,
    user,
    volume,
    webSearchAvailable,
    webSearchUsage,
    messageQueue,
    queuedMessageCount: messageQueue.length,
    isSyncingBackend,
    thinkingMode,
    setThinkingMode,
    thinkingText,
    isThinking,
  };
}

