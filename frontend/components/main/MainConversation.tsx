'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react'; // changed: added useLayoutEffect for synchronous scroll anchoring after DOM paint
import type { CSSProperties, ChangeEvent, ClipboardEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { AlertCircle, ArrowDown, BookOpen, Check, ChevronDown, Copy, FileText, GraduationCap, HelpCircle, Layers, Pencil, RotateCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import ChatInput from '@/components/ChatInput';
import ChatSkeleton from '@/components/ChatSkeleton';
import MessageBubble, { type Message } from '@/components/MessageBubble';
import { api } from '@/lib/api';
import {
  CHAT_TEXT_SIZE_EVENT,
  CHAT_TEXT_SIZE_KEY,
  CHAT_TEXT_SIZE_PIXELS,
  CHAT_TEXT_SIZE_STEPS,
  type ChatTextSize,
} from '@/lib/settings-events';
import type { WebSearchUsage } from './types';
import { toast } from 'sonner';
import { QuickActionCards } from "@/components/main/QuickActionCards" // [QUICK ACTION CARDS]
import { QuickActionModal } from "@/components/main/QuickActionModal" // [QUICK ACTION CARDS]
import { QUICK_ACTION_CARDS } from "@/components/main/QuickActionCards" // [QUICK ACTION CARDS]

const MESSAGE_COLLAPSE_THRESHOLD = 300;
// changed: LOAD_OLDER_SCROLL_THRESHOLD removed — IntersectionObserver replaces the scroll threshold check
const CHAT_TEXT_SIZE_STYLES: Record<ChatTextSize, CSSProperties> = {
  small: { '--chat-text-size': CHAT_TEXT_SIZE_PIXELS.small } as CSSProperties,
  medium: { '--chat-text-size': CHAT_TEXT_SIZE_PIXELS.medium } as CSSProperties,
  large: { '--chat-text-size': CHAT_TEXT_SIZE_PIXELS.large } as CSSProperties,
  xl: { '--chat-text-size': CHAT_TEXT_SIZE_PIXELS.xl } as CSSProperties,
};

const EMPTY_STATE_CHIPS = [
  { label: 'Study', prompt: 'Help me study my current pharmacy materials.', icon: GraduationCap },
  { label: 'Summarize PDF', prompt: 'Summarize this PDF for me.', icon: FileText },
  { label: 'Quiz me', prompt: 'Quiz me on this topic.', icon: HelpCircle },
  { label: 'Past questions', prompt: 'Help me practice past questions.', icon: Layers },
  { label: 'Explain topic', prompt: 'Explain this topic in simple terms.', icon: BookOpen },
];

type WelcomeCopy = {
  greeting: string;
  mobileGreeting: string;
  subtexts: string[];
};

const pickFrom = (items: string[]) => items[Math.floor(Math.random() * items.length)] || items[0];

const buildWelcomeCopy = (firstName: string): WelcomeCopy => {
  const hour = new Date().getHours();
  const name = firstName || 'there';
  const mobileGreeting = pickFrom([
    `Hi, ${name}`,
    `Hello, ${name}`,
    `Welcome, ${name}`,
    `Hey, ${name}`,
  ]);

  if (hour >= 23 || hour < 3) {
    return {
      greeting: pickFrom([
        `Hey night owl, ${name}`,
        `Still studying, Pharm ${name}?`,
        `Late session, ${name}?`,
      ]),
      mobileGreeting,
      subtexts: [
        'What are we studying tonight?',
        'Let us keep it simple and focused.',
        'Need a quick explanation before you rest?',
        'Want a short recap before calling it a night?',
        'Bring the hard part. We will work through it slowly.',
      ],
    };
  }

  if (hour >= 3 && hour < 5) {
    return {
      greeting: pickFrom([
        `Early start, Pharm ${name}`,
        `Up early, ${name}?`,
        `Hello Pharm, ${name}`,
      ]),
      mobileGreeting,
      subtexts: [
        'What should we warm up with?',
        'Want a quick revision before the day starts?',
        'Let us make this early session count.',
        'Which topic needs a calm first pass?',
      ],
    };
  }

  if (hour >= 5 && hour < 12) {
    return {
      greeting: pickFrom([
        `Good morning, Pharm ${name}`,
        `Hello Pharm, ${name}`,
        `Ready to study, ${name}?`,
      ]),
      mobileGreeting,
      subtexts: [
        'What are we studying today?',
        'Want a quick recap before class?',
        "Let's make today's lectures easier to follow.",
        'Which topic should we clear up before the day gets busy?',
        'Need a simple explanation to start strong?',
      ],
    };
  }

  if (hour >= 12 && hour < 17) {
    return {
      greeting: pickFrom([
        `Good afternoon, Pharm ${name}`,
        `Hi Pharm, ${name}`,
        `Welcome back, ${name}`,
      ]),
      mobileGreeting,
      subtexts: [
        'What topic should we clear up?',
        "Need help connecting today's notes?",
        'Let us review it while it is still fresh.',
        'Which concept from class should we simplify?',
        'Want to test yourself with a few questions?',
      ],
    };
  }

  return {
    greeting: pickFrom([
      `Good evening, Pharm ${name}`,
      `Welcome back, ${name}`,
      `Hello Pharm, ${name}`,
    ]),
    mobileGreeting,
    subtexts: [
      "Want a quick recap of today's lectures?",
      "Let's turn today's study into something clear.",
      'What should we revise tonight?',
      'Need help making sense of a tough topic?',
      'Ready for a focused revision session?',
    ],
  };
};

const getImages = (imgData: string | undefined): string[] => {
  if (!imgData) {
    return [];
  }

  try {
    if (imgData.trim().startsWith('[') && imgData.trim().endsWith(']')) {
      const parsed = JSON.parse(imgData);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    return [imgData];
  } catch {
    return [imgData];
  }
};

type NoteParagraphBlock = {
  type: 'paragraph';
  content: Array<{
    type: 'text';
    text: string;
    styles: Record<string, never>;
  }>;
};

type ExistingNote = {
  id: string;
  title: string;
};

type NotesListResponse = {
  notes?: Array<{
    id?: string | number | null;
    title?: string | null;
  }>;
};

const createParagraphBlock = (text: string): NoteParagraphBlock => ({
  type: 'paragraph',
  content: [
    {
      type: 'text',
      text,
      styles: {},
    },
  ],
});

type MainConversationProps = {
  activeSessionId: string | null;
  chatEndRef: RefObject<HTMLDivElement | null>;
  chatError: string | null;
  chatScrollRef: RefObject<HTMLDivElement | null>;
  editDraft: string;
  editingMessageId: string | null;
  expandedMessages: Set<string>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleEditMessage: (messageId: string, newText: string) => Promise<void>;
  handleFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  handleLoadOlderMessages: () => Promise<void>;
  handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  handleRegenerate: () => Promise<void>;
  handleRetryFailure: () => void;
  handleSendMessage: (overrideText?: string) => void;
  handleStopGeneration: () => void;
  handleVoiceToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
  hasMessages: boolean;
  hasOlderMessages: boolean;
  inputMessage: string;
  isError: boolean;
  isListening: boolean;
  isLoading: boolean;
  isLoadingChat: boolean;
  isLoadingOlder: boolean;
  isProcessing: boolean;
  isStarting: boolean;
  isWebSearchEnabled: boolean;
  maxImages: number;
  messages: Message[];
  onDropImage: (base64: string) => void;
  onScrollStateChange?: (isScrolledUp: boolean) => void;
  pendingAttachments: string[];
  removeAttachment: (index: number) => void;
  selectedImageSetter: (image: string) => void;
  setEditDraft: (value: string) => void;
  setEditingMessageId: (value: string | null) => void;
  setInputMessage: (value: string) => void;
  setWebSearchEnabled: Dispatch<SetStateAction<boolean>>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  toggleExpand: (id: string) => void;
  volume: number;
  webSearchAvailable: boolean;
  webSearchUsage: WebSearchUsage;
  /** Number of messages queued while isLoading — shown as a badge on the stop button. */
  queuedMessageCount?: number;
  thinkingMode: boolean;
  onThinkingModeChange: (value: boolean) => void;
  thinkingText: string;
  isThinking: boolean;
  studentFirstName: string;
};

export function MainConversation({
  activeSessionId,
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
  handlePaste,
  handleRegenerate,
  handleRetryFailure,
  handleSendMessage,
  handleStopGeneration,
  handleVoiceToggle,
  hasMessages,
  hasOlderMessages,
  inputMessage,
  isError,
  isListening,
  isLoading,
  isLoadingChat,
  isLoadingOlder,
  isProcessing,
  isStarting,
  isWebSearchEnabled,
  maxImages,
  messages,
  onDropImage,
  onScrollStateChange,
  pendingAttachments,
  removeAttachment,
  selectedImageSetter,
  setEditDraft,
  setEditingMessageId,
  setInputMessage,
  setWebSearchEnabled,
  textareaRef,
  toggleExpand,
  volume,
  webSearchAvailable,
  webSearchUsage,
  queuedMessageCount = 0,
  thinkingMode,
  onThinkingModeChange,
  thinkingText,
  isThinking,
  studentFirstName,
}: MainConversationProps) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [chatTextSize, setChatTextSize] = useState<ChatTextSize>('medium');
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const olderMessagesTriggerRef = useRef<HTMLDivElement | null>(null); // changed: sentinel div watched by IntersectionObserver to load older messages
  const scrollContainerRef = useRef<HTMLDivElement>(null); // changed: local ref to the scroll container for synchronous height measurements
  const previousScrollHeight = useRef<number>(0); // changed: captures scrollHeight right before fetch so useLayoutEffect can anchor position
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const [bookmarkMode, setBookmarkMode] = useState<'new' | 'existing'>('new');
  const [bookmarkMessage, setBookmarkMessage] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [existingNotes, setExistingNotes] = useState<ExistingNote[]>([]);
  const [isLoadingExistingNotes, setIsLoadingExistingNotes] = useState(false);
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [selectedExistingNoteId, setSelectedExistingNoteId] = useState<string | null>(null);
  const [existingNoteSearch, setExistingNoteSearch] = useState('');
  const [activeCard, setActiveCard] = useState<typeof QUICK_ACTION_CARDS[number] | null>(null); // [QUICK ACTION CARDS]
  const [welcomeCopy, setWelcomeCopy] = useState<WelcomeCopy>(() => ({
    greeting: `Hello Pharm, ${studentFirstName || 'there'}`,
    mobileGreeting: `Hi, ${studentFirstName || 'there'}`,
    subtexts: ['What are we studying today?'],
  }));
  const [welcomeSubtextIndex, setWelcomeSubtextIndex] = useState(0);
  const [typedWelcomeSubtext, setTypedWelcomeSubtext] = useState('What are we studying today?');

  useEffect(() => {
    setWelcomeCopy(buildWelcomeCopy(studentFirstName));
    setWelcomeSubtextIndex(0);
  }, [studentFirstName]);

  useEffect(() => {
    if (hasMessages || welcomeCopy.subtexts.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setWelcomeSubtextIndex((current) => (current + 1) % welcomeCopy.subtexts.length);
    }, 150000);

    return () => window.clearInterval(interval);
  }, [hasMessages, welcomeCopy.subtexts.length]);

  const currentWelcomeSubtext = welcomeCopy.subtexts[welcomeSubtextIndex] || welcomeCopy.subtexts[0] || '';

  useEffect(() => {
    if (!currentWelcomeSubtext) {
      setTypedWelcomeSubtext('');
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setTypedWelcomeSubtext(currentWelcomeSubtext);
      return;
    }

    setTypedWelcomeSubtext('');
    let cursor = 0;
    const interval = window.setInterval(() => {
      cursor += 1;
      setTypedWelcomeSubtext(currentWelcomeSubtext.slice(0, cursor));
      if (cursor >= currentWelcomeSubtext.length) {
        window.clearInterval(interval);
      }
    }, 24);

    return () => window.clearInterval(interval);
  }, [currentWelcomeSubtext]);

  useEffect(() => {
    const savedSize = window.localStorage.getItem(CHAT_TEXT_SIZE_KEY);
    if (CHAT_TEXT_SIZE_STEPS.includes(savedSize as ChatTextSize)) {
      setChatTextSize(savedSize as ChatTextSize);
    }

    const handleChatTextSizeUpdated = (event: Event) => {
      const size = (event as CustomEvent<ChatTextSize>).detail;
      if (CHAT_TEXT_SIZE_STEPS.includes(size)) {
        setChatTextSize(size);
      }
    };

    window.addEventListener(CHAT_TEXT_SIZE_EVENT, handleChatTextSizeUpdated as EventListener);
    return () => window.removeEventListener(CHAT_TEXT_SIZE_EVENT, handleChatTextSizeUpdated as EventListener);
  }, []);

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container || isLoadingChat) {
      setShowScrollToBottom(false);
      return;
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollToBottom(distanceFromBottom > 100);
  }, [chatScrollRef, isLoadingChat, messages]);

  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const closeBookmarkModal = () => {
    setIsBookmarkModalOpen(false);
    setIsSavingBookmark(false);
    setBookmarkMode('new');
    setNewNoteTitle('');
    setBookmarkMessage('');
    setSelectedExistingNoteId(null);
    setExistingNoteSearch('');
  };

  const loadExistingNotes = async () => {
    if (isLoadingExistingNotes) {
      return;
    }

    setIsLoadingExistingNotes(true);
    try {
      const response = await api.get('/notes');
      if (!response.ok) {
        throw new Error(`Failed to load notes: ${response.status}`);
      }

      const payload = (await response.json()) as NotesListResponse;
      const mappedNotes = (payload.notes ?? [])
        .filter((note): note is { id: string | number; title?: string | null } => note.id !== undefined && note.id !== null)
        .map((note) => ({
          id: String(note.id),
          title: typeof note.title === 'string' && note.title.trim().length > 0 ? note.title.trim() : 'Untitled note',
        }));
      setExistingNotes(mappedNotes);
    } catch (error) {
      console.error('Failed to load existing notes:', error);
      toast.error('Unable to load notes');
    } finally {
      setIsLoadingExistingNotes(false);
    }
  };

  const openBookmarkModal = (content: string): boolean => {
    if (!content.trim()) {
      return false;
    }

    setBookmarkMessage(content);
    setNewNoteTitle('');
    setBookmarkMode('new');
    setSelectedExistingNoteId(null);
    setExistingNoteSearch('');
    setIsBookmarkModalOpen(true);
    return false;
  };

  const handleBookmarkModeChange = (mode: 'new' | 'existing') => {
    setBookmarkMode(mode);
    if (mode === 'existing') {
      void loadExistingNotes();
    }
  };

  const handleSaveBookmark = async () => {
    const normalizedMessage = bookmarkMessage.trim();
    if (!normalizedMessage || isSavingBookmark) {
      return;
    }

    const paragraphBlock = createParagraphBlock(normalizedMessage);
    setIsSavingBookmark(true);
    try {
      if (bookmarkMode === 'new') {
        const response = await api.post('/notes', {
          title: newNoteTitle.trim() ? newNoteTitle.trim() : null,
          content: [paragraphBlock],
          document_id: null,
        });
        if (!response.ok) {
          throw new Error(`Failed to save note: ${response.status}`);
        }
        toast.success('Note saved');
        closeBookmarkModal();
        return;
      }

      if (!selectedExistingNoteId) {
        return;
      }

      const response = await api.patch(`/notes/${selectedExistingNoteId}`, {
        append_blocks: true,
        content: [paragraphBlock],
      });
      if (!response.ok) {
        throw new Error(`Failed to update note: ${response.status}`);
      }
      toast.success('Added to note');
      closeBookmarkModal();
    } catch (error) {
      console.error('Failed to bookmark message:', error);
      toast.error('Unable to save note');
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const filteredExistingNotes = existingNotes.filter((note) =>
    note.title.toLowerCase().includes(existingNoteSearch.trim().toLowerCase())
  );

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container) {
      return;
    }

    const handleConversationScroll = () => {
      if (isLoadingChat) {
        setShowScrollToBottom(false);
        return;
      }

      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const isAtBottom = distanceFromBottom < 50;
      setShowScrollToBottom(distanceFromBottom > 100);
      onScrollStateChange?.(!isAtBottom);

      // changed: scroll-based trigger — reliable on all browsers including iOS Safari.
      // The old churn bug is gone: handleLoadOlderMessages is now stable (ref-based guards),
      // so this listener never causes dependency churn.
      if (hasOlderMessages && container.scrollTop <= 300 && scrollContainerRef.current) {
        previousScrollHeight.current = scrollContainerRef.current.scrollHeight; // changed: capture height before fetch for useLayoutEffect anchoring
        void handleLoadOlderMessages();
      }
    };

    container.addEventListener('scroll', handleConversationScroll, { passive: true });
    handleConversationScroll(); // changed: run once on mount to sync initial state

    return () => container.removeEventListener('scroll', handleConversationScroll);
  }, [
    chatScrollRef,
    handleLoadOlderMessages, // changed: safe to include — callback is now stable, won't cause churn
    hasOlderMessages,         // changed: safe to include — only changes when older messages are exhausted
    isLoadingChat,
    onScrollStateChange,
  ]);

  // changed: IntersectionObserver removed — replaced by scroll listener above (cross-browser reliable)

  // changed: runs synchronously after React commits new messages to the DOM, preventing the scroll-jump
  useLayoutEffect(() => {
    if (previousScrollHeight.current > 0 && scrollContainerRef.current) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight;
      const heightDifference = newScrollHeight - previousScrollHeight.current; // changed: exact pixel height of the prepended messages
      scrollContainerRef.current.scrollTop += heightDifference; // changed: bump scroll down instantly so viewport stays on the same message
      previousScrollHeight.current = 0; // changed: reset so normal message updates are not affected
    }
  }, [messages]); // changed: fires whenever the messages array changes — only acts when previousScrollHeight was captured

  const handleScrollToBottom = () => {
    const container = chatScrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  };

  const handleQuickActionSubmit = (prompt: string) => { // [QUICK ACTION CARDS]
    handleSendMessage(prompt); // [QUICK ACTION CARDS]
  }; // [QUICK ACTION CARDS]

  const renderChatInput = (
    compactSpacing = false,
    variant: 'default' | 'welcome' = 'default',
    placeholder = 'Ask anything...'
  ) => (
    <ChatInput
      pendingAttachments={pendingAttachments}
      maxImages={maxImages}
      inputMessage={inputMessage}
      isListening={isListening}
      isStarting={isStarting}
      isProcessing={isProcessing}
      isLoading={isLoading}
      isWebSearchEnabled={isWebSearchEnabled}
      webSearchAvailable={webSearchAvailable}
      webSearchUsage={webSearchUsage}
      volume={volume}
      textareaRef={textareaRef}
      fileInputRef={fileInputRef}
      onInputMessageChange={setInputMessage}
      onRemoveAttachment={removeAttachment}
      onFileUpload={handleFileUpload}
      onPaste={handlePaste}
      onToggleWebSearch={() => setWebSearchEnabled((previous) => !previous)}
      onVoiceToggle={handleVoiceToggle}
      onStopGeneration={handleStopGeneration}
      onSendMessage={handleSendMessage}
      onDropImage={onDropImage}
      queuedMessageCount={queuedMessageCount}
      thinkingMode={thinkingMode}
      onThinkingModeChange={onThinkingModeChange}
      compactSpacing={compactSpacing}
      variant={variant}
      placeholder={placeholder}
    />
  );

  return (
    <div className="flex-1 w-full min-w-0 min-h-0 relative flex flex-col bg-background">
      {/* changed: absolute at top-[73px] = exactly below the 73px header, no z-index tricks needed */}
      <div className="absolute top-[73px] left-0 right-0 z-10 pointer-events-none">
        <AnimatePresence>
          {isLoadingOlder && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-[3px] overflow-hidden bg-primary/10" // changed: bar sits flush at the bottom edge of the header
            >
              <motion.div
                className="h-full w-1/3 bg-primary"
                animate={{ x: ['-110%', '320%'] }}
                transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div
        ref={(node) => { // changed: attach both the prop ref and the local scrollContainerRef to the same DOM node
          (chatScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className="flex-1 min-h-0 overflow-y-auto pt-16 pb-4"
        style={{ ...CHAT_TEXT_SIZE_STYLES[chatTextSize], overflowAnchor: 'none' }} // changed: overflowAnchor:'none' lets our useLayoutEffect own scroll anchoring
      >
        <div className="max-w-[741px] mx-auto px-4 min-h-full flex flex-col">
          {isLoadingChat ? (
            <ChatSkeleton />
          ) : !hasMessages ? (
            <div className="flex-1 flex flex-col items-start justify-start px-4 pb-0 pt-16 text-left sm:items-center sm:justify-center sm:px-0 sm:pb-56 sm:pt-40 sm:text-center">
              <div className="w-full max-w-[440px] flex flex-col flex-1 sm:mx-auto sm:max-w-4xl sm:block">
                <div className="text-left sm:px-4 sm:text-center">
                  <div className="mb-4 flex flex-col items-start justify-start gap-3 sm:mb-3 sm:flex-row sm:items-center sm:justify-center">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center sm:h-9 sm:w-9">
                      <img src="/avatar.png" alt="PansGPT" className="h-8 w-8 object-contain drop-shadow-sm sm:h-7 sm:w-7" />
                    </div>
                    <h2
                      className="text-2xl font-semibold leading-tight text-foreground sm:text-[26px] sm:font-medium sm:text-4xl"
                    >
                      <span className="sm:hidden">{welcomeCopy.mobileGreeting}</span>
                      <span className="hidden sm:inline">{welcomeCopy.greeting}</span>
                    </h2>
                  </div>
                  <p className="mt-4 min-h-[24px] text-sm leading-relaxed text-muted-foreground sm:hidden">
                    {typedWelcomeSubtext}
                    {typedWelcomeSubtext.length < currentWelcomeSubtext.length && (
                      <span className="ml-0.5 inline-block h-[1em] w-px translate-y-0.5 animate-pulse bg-muted-foreground" />
                    )}
                  </p>
                </div>

                <div className="mt-6 hidden sm:block">
                  {renderChatInput(true, 'welcome', typedWelcomeSubtext || currentWelcomeSubtext || 'Ask anything...')}
                </div>

                <div className="hidden sm:block">
                  <QuickActionModal // [QUICK ACTION CARDS]
                    isOpen={activeCard !== null} // [QUICK ACTION CARDS]
                    onClose={() => setActiveCard(null)} // [QUICK ACTION CARDS]
                    card={activeCard} // [QUICK ACTION CARDS]
                    onSubmit={handleQuickActionSubmit} // [QUICK ACTION CARDS]
                  /> {/* [QUICK ACTION CARDS] */}
                </div>

                {activeCard === null && !inputMessage.trim() ? (
                  <>
                    <div className="flex-1 sm:hidden" />
                    <AnimatePresence>
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="mt-24 sm:mt-0"
                      >
                        <QuickActionCards onCardClick={setActiveCard} />
                      </motion.div>
                    </AnimatePresence>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="py-4 flex flex-col">
              {/* changed: sentinel div removed — scroll listener replaces IntersectionObserver */}
              {messages.filter((message) => message.role !== 'system').map((message, index, filteredMessages) => {
                const isStreamingAI = isLoading && index === filteredMessages.length - 1 && message.role !== 'user';
                const messageKey = String(message.id ?? `msg-${index}`);
                const isLongUserMessage =
                  message.role === 'user' && message.content.length > MESSAGE_COLLAPSE_THRESHOLD;
                const isExpanded = expandedMessages.has(messageKey);

                return (
                  <div id={`chat-message-${index}`} key={index} className={`flex flex-col ${message.role === 'user' ? 'items-end mb-[6px] md:mb-[12px]' : 'items-start mb-8'} w-full group`}>
                    {message.role === 'user' ? (
                      <>
                        {(() => {
                          const backendImages = getImages(message.image_data);
                          const allImages = [...(message.images || []), ...backendImages];
                          if (message.imageBase64 && !allImages.includes(message.imageBase64)) {
                            allImages.push(message.imageBase64);
                          }
                          const uniqueImages = Array.from(new Set(allImages));

                          return uniqueImages.length > 0 ? (
                            <div className="flex flex-wrap gap-2 mb-2 justify-end">
                              {uniqueImages.map((image, imageIndex) => (
                                <div key={imageIndex} onClick={() => selectedImageSetter(image)} className="cursor-zoom-in">
                                  <img
                                    src={`data:image/jpeg;base64,${image}`}
                                    alt={`Attachment ${imageIndex + 1}`}
                                    className="w-20 h-20 object-cover rounded-lg shadow-sm hover:opacity-90 transition-opacity"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null;
                        })()}

                        {message.content &&
                          (editingMessageId === String(message.id) ? (
                            <div className="max-w-[85%] w-full flex flex-col gap-2">
                              <textarea
                                value={editDraft}
                                onChange={(event) => setEditDraft(event.target.value)}
                                className="w-full bg-accent rounded-xl px-4 py-3 text-base md:text-[15px] leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none min-h-[80px]"
                                rows={5}
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => {
                                    setEditingMessageId(null);
                                    setEditDraft('');
                                  }}
                                  className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent rounded-lg transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    if (editDraft.trim() && message.id) {
                                      void handleEditMessage(String(message.id), editDraft.trim());
                                    }
                                  }}
                                  disabled={!editDraft.trim()}
                                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
                                >
                                  Save & Send
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="max-w-[85%]">
                                <div
                                  className="bg-primary/20 dark:bg-secondary text-[#1b4332] dark:text-secondary-foreground font-sans px-5 py-3 rounded-2xl rounded-tr-sm leading-relaxed"
                                  style={{ fontSize: 'var(--chat-text-size)' }}
                                >
                                  <div className={isLongUserMessage && !isExpanded ? 'line-clamp-4' : ''}>
                                    {message.content}
                                  </div>
                                </div>
                                {isLongUserMessage && (
                                  <button
                                    onClick={() => toggleExpand(messageKey)}
                                    className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <ChevronDown
                                      size={14}
                                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                    />
                                    {isExpanded ? 'Show less' : 'Show more'}
                                  </button>
                                )}
                              </div>
                            </>
                          ))}
                        <div className="mt-1 flex items-center justify-end gap-1 text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
                          {message.content && editingMessageId !== String(message.id) && (
                            <>
                              <button
                                onClick={() => {
                                  if (message.id) {
                                    setEditingMessageId(String(message.id));
                                    setEditDraft(message.content);
                                  }
                                }}
                                className="p-1.5 hover:bg-muted rounded-md transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => void handleCopyMessage(messageKey, message.content)}
                                className="p-1.5 hover:bg-muted rounded-md transition-colors"
                                title="Copy message"
                              >
                                {copiedMessageId === messageKey ? (
                                  <Check className="w-3.5 h-3.5 text-primary" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    ) : message.role === 'system' ? (
                      <div className="text-sm text-muted-foreground italic px-4 py-2 text-center w-full">
                        {message.content}
                      </div>
                    ) : (
                      <>
                        <MessageBubble
                          message={message}
                          isThinking={Boolean(message.isThinking)}
                          isStreaming={isStreamingAI}
                          onAddToNote={openBookmarkModal}
                          noteActionIcon="bookmark"
                          onRegenerate={index === messages.length - 1 && activeSessionId ? handleRegenerate : undefined}
                          thinkingText={isStreamingAI ? thinkingText : message.thinking_text}
                          isThinkingStreaming={isThinking && isStreamingAI}
                        />
                      </>
                    )}
                  </div>
                );
              })}

              {isError && !isLoading && (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl text-sm">
                  <AlertCircle className="w-5 h-5 text-destructive-foreground shrink-0" />
                  <span className="text-destructive-foreground font-medium flex-1">
                    {chatError || 'Network Error: Please try again.'}
                  </span>
                  <button
                    onClick={handleRetryFailure}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-colors shrink-0"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Retry
                  </button>
                </div>
              )}

              <div ref={chatEndRef} className="h-4" />
            </div>
          )}
        </div>
      </div>



      {isBookmarkModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-foreground">Save to notes</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {bookmarkMessage.slice(0, 100)}
                {bookmarkMessage.length > 100 ? '...' : ''}
              </p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-1">
              <button
                type="button"
                onClick={() => handleBookmarkModeChange('new')}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  bookmarkMode === 'new' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Save as new note
              </button>
              <button
                type="button"
                onClick={() => handleBookmarkModeChange('existing')}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  bookmarkMode === 'existing' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Add to existing
              </button>
            </div>

            {bookmarkMode === 'new' ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={newNoteTitle}
                  onChange={(event) => setNewNoteTitle(event.target.value)}
                  placeholder="Note title..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  value={existingNoteSearch}
                  onChange={(event) => setExistingNoteSearch(event.target.value)}
                  placeholder="Search notes..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40"
                />
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background">
                  {isLoadingExistingNotes ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">Loading notes...</div>
                  ) : filteredExistingNotes.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">No notes found</div>
                  ) : (
                    filteredExistingNotes.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => setSelectedExistingNoteId(note.id)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                          selectedExistingNoteId === note.id ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        <span className="truncate">{note.title}</span>
                        {selectedExistingNoteId === note.id && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeBookmarkModal()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveBookmark()}
                disabled={isSavingBookmark || (bookmarkMode === 'existing' && !selectedExistingNoteId)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingBookmark ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full shrink-0">
        <div
          className={`pointer-events-none absolute bottom-[calc(100%+24px)] left-1/2 z-10 -translate-x-1/2 transition-opacity duration-200 ${
            showScrollToBottom && !isLoadingChat ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button
            type="button"
            onClick={handleScrollToBottom}
            aria-label="Scroll to bottom"
            className="pointer-events-auto bg-background border border-border rounded-full shadow-lg p-1.5 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-center"
          >
            <ArrowDown className="w-4 h-4" strokeWidth={2.4} />
          </button>
        </div>

        <div className="sm:hidden">
          <QuickActionModal // [QUICK ACTION CARDS]
            isOpen={activeCard !== null} // [QUICK ACTION CARDS]
            onClose={() => setActiveCard(null)} // [QUICK ACTION CARDS]
            card={activeCard} // [QUICK ACTION CARDS]
            onSubmit={handleQuickActionSubmit} // [QUICK ACTION CARDS]
          /> {/* [QUICK ACTION CARDS] */}
        </div>

        {hasMessages ? renderChatInput() : <div className="sm:hidden">{renderChatInput()}</div>}
      </div>
    </div>
  );
}
