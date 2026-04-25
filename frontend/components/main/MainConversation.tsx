import { useEffect, useLayoutEffect, useRef, useState } from 'react'; // changed: added useLayoutEffect for synchronous scroll anchoring after DOM paint
import type { CSSProperties, ChangeEvent, ClipboardEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { AlertCircle, Check, ChevronDown, Copy, Pencil, RotateCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import ChatInput from '@/components/ChatInput';
import ChatSkeleton from '@/components/ChatSkeleton';
import MessageBubble, { type Message } from '@/components/MessageBubble';
import { CHAT_TEXT_SIZE_EVENT, CHAT_TEXT_SIZE_KEY, type ChatTextSize } from '@/lib/settings-events';
import type { WebSearchUsage } from './types';

const MESSAGE_COLLAPSE_THRESHOLD = 300;
// changed: LOAD_OLDER_SCROLL_THRESHOLD removed — IntersectionObserver replaces the scroll threshold check
const CHAT_TEXT_SIZE_STYLES: Record<ChatTextSize, CSSProperties> = {
  small: { '--chat-text-size': '14px' } as CSSProperties,
  medium: { '--chat-text-size': '15px' } as CSSProperties,
  large: { '--chat-text-size': '17px' } as CSSProperties,
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
  handleSendMessage: () => void;
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
}: MainConversationProps) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [chatTextSize, setChatTextSize] = useState<ChatTextSize>('medium');
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const olderMessagesTriggerRef = useRef<HTMLDivElement | null>(null); // changed: sentinel div watched by IntersectionObserver to load older messages
  const scrollContainerRef = useRef<HTMLDivElement>(null); // changed: local ref to the scroll container for synchronous height measurements
  const previousScrollHeight = useRef<number>(0); // changed: captures scrollHeight right before fetch so useLayoutEffect can anchor position

  useEffect(() => {
    const savedSize = window.localStorage.getItem(CHAT_TEXT_SIZE_KEY);
    if (savedSize === 'small' || savedSize === 'medium' || savedSize === 'large') {
      setChatTextSize(savedSize);
    }

    const handleChatTextSizeUpdated = (event: Event) => {
      const size = (event as CustomEvent<ChatTextSize>).detail;
      if (size === 'small' || size === 'medium' || size === 'large') {
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

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container) {
      return;
    }

    const updateScrollState = () => { // changed: removed shouldTryLoadOlder param — scroll listener no longer triggers load
      if (isLoadingChat) {
        setShowScrollToBottom(false);
        return;
      }

      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const isAtBottom = distanceFromBottom < 50;
      setShowScrollToBottom(distanceFromBottom > 100);
      onScrollStateChange?.(!isAtBottom);
      // changed: removed scroll-top threshold check — IntersectionObserver handles older-message loading
    };

    const handleConversationScroll = () => {
      updateScrollState(); // changed: no longer passes shouldTryLoadOlder flag
    };

    // changed: handleConversationWheel removed — wheel-based older-message trigger replaced by IntersectionObserver

    container.addEventListener('scroll', handleConversationScroll, { passive: true });
    updateScrollState(); // changed: initial state sync without older-message check

    return () => {
      container.removeEventListener('scroll', handleConversationScroll);
      // changed: wheel listener removal no longer needed
    };
  }, [
    chatScrollRef,
    // changed: handleLoadOlderMessages removed from deps — scroll listener no longer calls it
    // changed: hasOlderMessages removed from deps — no longer needed in scroll listener
    isLoadingChat,
    // changed: isLoadingOlder removed from deps — no longer gated here
    onScrollStateChange,
  ]);

  // changed: IntersectionObserver watches invisible trigger div at top of message list
  useEffect(() => {
    const trigger = olderMessagesTriggerRef.current;
    if (!trigger || !hasOlderMessages) return; // changed: only attach observer when there are older messages to load

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && scrollContainerRef.current) {
          // changed: capture exact scrollHeight BEFORE the fetch so useLayoutEffect can compute the diff
          previousScrollHeight.current = scrollContainerRef.current.scrollHeight;
          void handleLoadOlderMessages();
        }
      },
      {
        root: scrollContainerRef.current, // changed: watch relative to the scroll container div, NOT the viewport — without this, scrolling inside the div doesn't move the sentinel viewport-wise so the observer never fires on mobile
        rootMargin: '300px 0px 0px 0px', // changed: 300px pre-load margin triggers fetch before sentinel is fully visible
        threshold: 0,
      }
    );

    observer.observe(trigger);
    return () => observer.disconnect(); // changed: disconnect observer on cleanup
  }, [hasOlderMessages, handleLoadOlderMessages]); // changed: only re-attach when these two change

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
        <div className="max-w-3xl mx-auto px-4 min-h-full flex flex-col">
          {isLoadingChat ? (
            <ChatSkeleton />
          ) : !hasMessages ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 w-16 h-16 rounded-full bg-primary/20 blur-xl" />
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <img src="/avatar.png" alt="PansGPT" className="w-10 h-10 object-contain drop-shadow-sm" />
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-medium text-foreground">What can I help with?</h2>
            </div>
          ) : (
            <div className="py-4 flex flex-col">
              <div ref={olderMessagesTriggerRef} className="h-1 w-full" /> {/* changed: invisible sentinel div — IntersectionObserver fires handleLoadOlderMessages when this enters viewport */}
              {messages.filter((message) => message.role !== 'system').map((message, index, filteredMessages) => {
                const isStreamingAI = isLoading && index === filteredMessages.length - 1 && message.role !== 'user';
                const messageKey = String(message.id ?? `msg-${index}`);
                const isLongUserMessage =
                  message.role === 'user' && message.content.length > MESSAGE_COLLAPSE_THRESHOLD;
                const isExpanded = expandedMessages.has(messageKey);

                return (
                  <div key={index} className={`flex flex-col ${message.role === 'user' ? 'items-end mb-[6px] md:mb-[12px]' : 'items-start mb-8'} w-full group`}>
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
                      <MessageBubble
                        message={message}
                        isThinking={Boolean(message.isThinking)}
                        isStreaming={isStreamingAI}
                        onRegenerate={index === messages.length - 1 && activeSessionId ? handleRegenerate : undefined}
                      />
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

      <div
        className={`pointer-events-none absolute bottom-[70px] left-1/2 z-10 -translate-x-1/2 transition-opacity duration-200 ${
          showScrollToBottom && !isLoadingChat ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={handleScrollToBottom}
          aria-label="Scroll to bottom"
          className="pointer-events-auto bg-background rounded-full shadow-sm p-2"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

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
      />
    </div>
  );
}
