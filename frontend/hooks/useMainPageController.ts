'use client';

import { useRouter, useSearchParams } from 'next/navigation';
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
const INITIAL_MESSAGE_LIMIT = 40;

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
  const searchParams = useSearchParams();

  const [user, setUser] = useState<MainUser>(null);
  const [authLoading, setAuthLoading] = useState(true);
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
  const [isError, setIsError] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(WEB_SEARCH_DEFAULT_KEY) === 'true';
  });
  const [webSearchAvailable, setWebSearchAvailable] = useState(true);
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

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
  const streamStatusRef = useRef('processing');
  const isCreatingSessionRef = useRef(false);
  const lastFailedRequestRef = useRef<FailedRequest>(null);
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
      if (user) {
        setAuthLoading(false);
        return;
      }

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
      let bootstrap = null;
      let profile = null;

      const isWelcomeFlow = new URLSearchParams(window.location.search).get('welcome') === 'true';
      if (mainBootstrapCache?.user.id === id && !isWelcomeFlow) {
        setUser(mainBootstrapCache.user);
        setIsAdmin(mainBootstrapCache.isAdmin);
        setWebSearchAvailable(mainBootstrapCache.webSearchAvailable);
        profile = { has_seen_welcome: mainBootstrapCache.hasSeenWelcome };
      } else {
        const bootstrapResponse = await api.get('/me/bootstrap');
        bootstrap = bootstrapResponse.ok ? await bootstrapResponse.json() : null;
        profile = bootstrap?.profile;

        const nextUser = {
          id,
          email: email || '',
          name:
            profile?.full_name ||
            [profile?.first_name, profile?.other_names].filter(Boolean).join(' ').trim() ||
            userMetadata?.full_name ||
            '',
          avatarUrl: profile?.avatar_url || userMetadata?.avatar_url || '',
          level: profile?.level || userMetadata?.level || '',
          university: profile?.university || userMetadata?.university || '',
          subscriptionTier: profile?.subscription_tier || 'free',
        };

        mainBootstrapCache = {
          user: nextUser,
          isAdmin: Boolean(bootstrap?.is_admin),
          webSearchAvailable: bootstrap?.system_settings?.web_search_enabled ?? true,
          hasSeenWelcome: Boolean(profile?.has_seen_welcome),
        };

        setUser(nextUser);
        setIsAdmin(mainBootstrapCache.isAdmin);
        setWebSearchAvailable(mainBootstrapCache.webSearchAvailable);
      }

      await fetchWebSearchUsage();

      // Show welcome modal if:
      // 1. Fresh signup (?welcome=true in URL), OR
      // 2. Existing user who hasn't seen it yet (has_seen_welcome = false)
      const isWelcomeParam = searchParams.get('welcome') === 'true';
      const pendingWelcome = window.localStorage.getItem('pansgpt-show-welcome') === 'true';

      if (isWelcomeParam) {
        window.localStorage.setItem('pansgpt-show-welcome', 'true');
        window.history.replaceState({}, '', '/main');
      }

      if ((isWelcomeParam || pendingWelcome || !profile?.has_seen_welcome)) {
        window.localStorage.removeItem('pansgpt-show-welcome');
        setShowWelcomeModal(true);
        await api.patch('/me/profile', { has_seen_welcome: true });
        if (mainBootstrapCache) {
          mainBootstrapCache.hasSeenWelcome = true;
        }
      }

      setAuthLoading(false);
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
  }, [fetchWebSearchUsage, router, searchParams, user]);

  useEffect(() => {
    const handleWebSearchDefaultUpdated = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail;
      if (typeof enabled === 'boolean') {
        setIsWebSearchEnabled(enabled);
      }
    };

    window.addEventListener(WEB_SEARCH_DEFAULT_EVENT, handleWebSearchDefaultUpdated as EventListener);
    return () => window.removeEventListener(WEB_SEARCH_DEFAULT_EVENT, handleWebSearchDefaultUpdated as EventListener);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WEB_SEARCH_DEFAULT_KEY, String(isWebSearchEnabled));
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
    scrollToBottom(true);
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    scrollToBottom(false);
  }, [isLoading, messages, scrollToBottom]);

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
    setMessages([]);
    setActiveSessionId(null);
    setInputMessage('');
    setPendingAttachments([]);
    setIsError(false);
    setChatError(null);
  }, [setActiveSessionId]);

  const handleLoadSession = useCallback(
    async (id: string) => {
      setIsLoadingChat(true);
      try {
        const loadedMessages = await loadSession(id);
        setMessages(loadedMessages as Message[]);
        setActiveSessionId(id);
        setIsError(false);
        setChatError(null);
        setHasOlderMessages(loadedMessages.length >= INITIAL_MESSAGE_LIMIT);
      } finally {
        setIsLoadingChat(false);
      }
    },
    [loadSession, setActiveSessionId]
  );

  useEffect(() => {
    if (activeSessionId) {
      if (isCreatingSessionRef.current) {
        isCreatingSessionRef.current = false;
        return;
      }
      void handleLoadSession(activeSessionId);
    } else {
      setMessages([]);
      setIsError(false);
      setChatError(null);
    }
  }, [activeSessionId, handleLoadSession]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!activeSessionId || isLoadingOlder || messages.length === 0) {
      return;
    }

    setIsLoadingOlder(true);
    try {
      const oldestMessage = messages[0] as Message & { created_at?: string };
      const beforeCursor = oldestMessage?.created_at;

      if (!beforeCursor) {
        setHasOlderMessages(false);
        return;
      }

      const olderMessages = await loadOlderMessages(activeSessionId, beforeCursor, 30);
      if (olderMessages.length === 0) {
        setHasOlderMessages(false);
      } else {
        const scrollElement = chatScrollRef.current;
        const previousScrollHeight = scrollElement?.scrollHeight || 0;
        setMessages((previous) => [...(olderMessages as Message[]), ...previous]);
        setHasOlderMessages(olderMessages.length >= 30);
        requestAnimationFrame(() => {
          if (scrollElement) {
            scrollElement.scrollTop = scrollElement.scrollHeight - previousScrollHeight;
          }
        });
      }
    } finally {
      setIsLoadingOlder(false);
    }
  }, [activeSessionId, isLoadingOlder, loadOlderMessages, messages]);

  const extractApiErrorMessage = (errorBody: unknown, fallback: string): string => {
    if (!errorBody || typeof errorBody !== 'object') {
      return fallback;
    }
    const payload = errorBody as Record<string, unknown>;
    if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
      return payload.detail;
    }
    if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message;
    }
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return payload.error;
    }
    return fallback;
  };

  const sendMessageApi = useCallback(
    async (text: string, attachments: string[] = [], isRetry = false) => {
      setIsLoading(true);
      setIsError(false);
      setChatError(null);
      lastFailedRequestRef.current = null;
      streamFullTextRef.current = '';

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const tempUserId = `temp-user-${Date.now()}`;
      const tempAssistantId = `temp-assistant-${Date.now()}`;

      try {
        let currentSessionId = activeSessionId;
        if (!currentSessionId) {
          const newSession = await createSession('New Chat');
          if (newSession) {
            currentSessionId = newSession.id;
            isCreatingSessionRef.current = true;
            setActiveSessionId(newSession.id);
          }
          if (!currentSessionId) {
            throw new Error('Could not create chat session. Please retry.');
          }
        }

        const newUserMessage: Message = {
          id: tempUserId,
          role: 'user',
          content: text,
          session_id: currentSessionId || undefined,
          ...(attachments.length > 0 && { imageBase64: attachments[0] }),
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
            nextBaseMessages = nextBaseMessages.slice(0, -1);
            const previousMessage = nextBaseMessages[nextBaseMessages.length - 1];
            if (previousMessage?.role === 'user') {
              nextBaseMessages = nextBaseMessages.slice(0, -1);
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

        const payload = {
          text,
          mode: 'chat',
          messages: updatedHistory,
          images: attachments.map((base64Data) => base64Data),
          image_base64: attachments.length > 0 ? attachments[0] : null,
          session_id: currentSessionId,
          is_retry: isRetry,
          web_search: isWebSearchEnabled,
        };

        const response = await api.fetch('/chat', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          let detail = `API error: ${response.status}`;
          try {
            const errorData = await response.json();
            detail = extractApiErrorMessage(errorData, detail);
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
          setChatError(error instanceof Error ? error.message : 'Network Error: Please try again.');
          lastFailedRequestRef.current = { type: 'send', text, attachments, isRetry };
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [activeSessionId, createSession, fetchHistory, fetchWebSearchUsage, isError, isWebSearchEnabled, messages, setActiveSessionId]
  );

  const handleSendMessage = useCallback(() => {
    if ((!inputMessage.trim() && pendingAttachments.length === 0) || isLoading) {
      return;
    }
    const messageText = inputMessage.trim();
    const attachments = [...pendingAttachments];
    setInputMessage('');
    setPendingAttachments([]);
    void sendMessageApi(messageText, attachments);
  }, [inputMessage, isLoading, pendingAttachments, sendMessageApi]);

  const handleStopGeneration = useCallback(() => {
    setIsLoading(false);
    abortControllerRef.current?.abort();
  }, []);

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

      const editIndex = messages.findIndex((message) => String(message.id) === String(messageId));
      if (editIndex !== -1) {
        const optimisticMessages = messages.slice(0, editIndex + 1);
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
        const targetMessageId = targetMessage?.id ? String(targetMessage.id) : String(messageId);
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
            message_id: targetMessageId,
            new_text: newText,
            ...(editImages ? { images: editImages } : {}),
          }),
        });

        if (!response.ok) {
          throw new Error(`Edit failed: ${response.status}`);
        }

        const finalAssistantMessageId = await consumeSSEStream(response, tempAssistantId, (newUserMessageId: string) => {
          setMessages((previous) =>
            previous.map((message) =>
              String(message.id) === String(targetMessageId)
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
        } else {
          console.error('Edit Error:', error);
          setMessages((previous) => previous.filter((message) => String(message.id) !== tempAssistantId));
          setIsError(true);
          setChatError(error instanceof Error ? error.message : 'Edit failed. Please try again.');
          lastFailedRequestRef.current = { type: 'edit', messageId: String(messageId), newText };
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [activeSessionId, messages]
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
        body: JSON.stringify({}),
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
      } else {
        console.error('Regenerate failed:', error);
        setMessages((previous) => previous.filter((message) => String(message.id) !== tempAssistantId));
        setIsError(true);
        setChatError(error instanceof Error ? error.message : 'Regenerate failed. Please try again.');
        lastFailedRequestRef.current = { type: 'regenerate' };
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [activeSessionId]);

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
  };
}