"use client";
import Image from "next/image";
import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from "react";
import React from "react";
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardIcon, PencilIcon, PaperAirplaneIcon, ChatBubbleLeftRightIcon, AcademicCapIcon, EllipsisVerticalIcon, HandThumbUpIcon, HandThumbDownIcon, StopIcon } from '@heroicons/react/24/outline';
import { HandThumbUpIcon as HandThumbUpIconSolid, HandThumbDownIcon as HandThumbDownIconSolid } from '@heroicons/react/24/solid';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import FeedbackPopup from '@/components/FeedbackPopup';

// Simple title generation (inline, no external dep)
function generateConversationTitle(text: string): string {
  const cleaned = text.replace(/[#*_`\[\]()]/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 6);
  return words.join(' ') + (cleaned.split(/\s+/).length > 6 ? '...' : '');
}
function isDefaultTitle(title: string): boolean {
  return !title || title === 'Conversation' || title === 'New Conversation';
}

type SupabaseUser = { id: string; email?: string; user_metadata?: { full_name?: string } };

type MessageRole = 'user' | 'system' | 'model';

interface ExtendedChatMessage {
  role: MessageRole;
  content: string;
  hasContext?: boolean;
  createdAt?: string;
  citations?: Array<{ lecturerName: string; documentTitle: string }>;
  feedback?: 'thumbs_up' | 'thumbs_down' | null;
}

interface Conversation {
  id: string;
  name: string;
  messages: ExtendedChatMessage[];
}

/**
 * Formats author name for APA 7th edition citation
 * Converts names to "Last, First Initial." format if not already formatted
 */
function formatAuthorName(lecturerName: string): string {
  let formattedAuthor = lecturerName.trim();

  // If the name doesn't contain a comma, try to format it
  if (!formattedAuthor.includes(',')) {
    const nameParts = formattedAuthor.split(/\s+/);
    if (nameParts.length >= 2) {
      // Assume last word is last name, rest are first/middle names
      const lastName = nameParts[nameParts.length - 1];
      const firstNames = nameParts.slice(0, -1);
      // Format as "Last, First Initial."
      const firstInitial = firstNames[0]?.charAt(0)?.toUpperCase() || '';
      formattedAuthor = `${lastName}, ${firstInitial}.`;
    }
  }

  return formattedAuthor;
}

// Memoize the message list component
const MessageList = React.memo(({
  messages,
  editingIdx,
  editingText,
  setEditingText,
  copiedIdx,
  handleEdit,
  handleEditCancel,
  handleEditSave,
  handleCopy,
  isLoading,
  showCitationsFor,
  setShowCitationsFor,
  handleFeedback
}: {
  messages: ExtendedChatMessage[];
  editingIdx: number | null;
  editingText: string;
  setEditingText: (text: string) => void;
  copiedIdx: number | null;
  handleEdit: (idx: number) => void;
  handleEditCancel: () => void;
  handleEditSave: (idx: number) => void;
  handleCopy: (idx: number, content: string) => void;
  isLoading: boolean;
  showCitationsFor: number | null;
  setShowCitationsFor: (idx: number | null) => void;
  handleFeedback: (idx: number, rating: 'thumbs_up' | 'thumbs_down') => void;
}) => (
  <div className="flex flex-col gap-6 md:gap-8">
    {messages.map((message, idx) => (
      <div key={idx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className="relative group max-w-[95%] md:max-w-[80%]">
          <div className={`p-3 md:p-6 transition-all duration-200 text-gray-900 dark:text-white ${message.role === 'user' ? 'bg-green-100 dark:[background-color:#2D3A2D] rounded-[18px_18px_0px_18px]' : 'bg-white dark:bg-transparent border border-gray-200 dark:border-transparent rounded-2xl'}`}
          >
            {editingIdx === idx ? (
              <div className="space-y-3">
                <textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      handleEditCancel();
                    }
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleEditSave(idx);
                    }
                  }}
                  className="w-full p-4 text-gray-900 dark:text-white bg-gray-100 dark:bg-[#2D3A2D] rounded-xl border border-gray-300 dark:border-white/10 focus:outline-none focus:border-green-600 dark:focus:border-[#00A400] text-sm md:text-base resize-none transition-all duration-200"
                  rows={4}
                  placeholder="Edit your message..."
                  autoFocus
                />

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => handleEditCancel()}
                    className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-white/70 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleEditSave(idx)}
                    disabled={!editingText.trim()}
                    className="px-6 py-2.5 text-sm font-semibold text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#008300]"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                    <span>Send</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={message.role === 'model' ? 'prose prose-sm dark:prose-invert prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-white prose-a:text-green-600 dark:prose-a:text-green-400 max-w-none' : ''}>
                  <MarkdownWithMath content={message.content} role={message.role} />
                </div>
                {message.role === 'model' && message.hasContext && (
                  <div className="mt-1.5 md:mt-2 text-xs md:text-sm text-gray-600 dark:text-white/70 italic">
                    Information from uploaded documents
                  </div>
                )}
              </>
            )}
          </div>
          {/* Action buttons */}
          <div className={`flex items-center gap-2 md:gap-3 ${message.role === 'user' ? 'justify-end mt-2' : 'justify-start pl-3 md:pl-6 mt-0.5'} relative z-50`}>
            <button
              onClick={() => handleCopy(idx, message.content)}
              className="text-gray-500 dark:text-gray-500 hover:text-green-600 dark:hover:text-white transition-colors"
              title="Copy message"
            >
              {copiedIdx === idx ? (
                <span className="text-xs text-green-600 dark:text-[#00A400] font-medium">Copied!</span>
              ) : (
                <ClipboardIcon className="h-4 w-4 md:h-5 md:w-5" />
              )}
            </button>
            {message.role === 'model' && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFeedback(idx, 'thumbs_up');
                  }}
                  className={`transition-colors ${message.feedback === 'thumbs_up'
                    ? 'text-green-600 dark:text-[#00A400]'
                    : 'text-gray-500 dark:text-gray-500 hover:text-green-600 dark:hover:text-white'
                    }`}
                  title="Helpful"
                >
                  {message.feedback === 'thumbs_up' ? (
                    <HandThumbUpIconSolid className="h-4 w-4 md:h-5 md:w-5" />
                  ) : (
                    <HandThumbUpIcon className="h-4 w-4 md:h-5 md:w-5" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFeedback(idx, 'thumbs_down');
                  }}
                  className={`transition-colors ${message.feedback === 'thumbs_down'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400'
                    }`}
                  title="Not helpful"
                >
                  {message.feedback === 'thumbs_down' ? (
                    <HandThumbDownIconSolid className="h-4 w-4 md:h-5 md:w-5" />
                  ) : (
                    <HandThumbDownIcon className="h-4 w-4 md:h-5 md:w-5" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCitationsFor(showCitationsFor === idx ? null : idx);
                  }}
                  className="text-gray-500 dark:text-gray-500 hover:text-green-600 dark:hover:text-white transition-colors"
                  title="View sources"
                >
                  <EllipsisVerticalIcon className="h-4 w-4 md:h-5 md:w-5" />
                </button>
              </>
            )}
            {message.role === 'user' && (
              <button
                onClick={() => handleEdit(idx)}
                className="text-gray-500 dark:text-gray-500 hover:text-green-600 dark:hover:text-white transition-colors"
                title="Edit message"
              >
                <PencilIcon className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            )}
            {showCitationsFor === idx && (
              <>
                <div
                  className="fixed inset-0 z-[45]"
                  onClick={() => setShowCitationsFor(null)}
                />
                <div className="absolute z-[60] left-0 bottom-full mb-2 p-3 bg-gray-100 dark:bg-[#2D3A2D] border border-gray-300 dark:border-green-800/50 rounded-lg shadow-lg max-w-sm min-w-[200px]">
                  <div className="text-xs font-semibold text-gray-700 dark:text-green-100 mb-2">
                    Sources:
                  </div>
                  {message.citations && message.citations.length > 0 ? (
                    <div className="space-y-2">
                      {message.citations.map((citation: { lecturerName: string; documentTitle: string }, citationIdx: number) => {
                        const formattedAuthor = formatAuthorName(citation.lecturerName);
                        const formattedTitle = citation.documentTitle.trim();
                        return (
                          <div key={citationIdx} className="text-xs text-gray-600 dark:text-green-200/80 leading-relaxed">
                            {formattedAuthor}. <span className="italic">{formattedTitle}</span> [Lecture notes]. University of Jos, Faculty of Pharmaceutical Sciences.
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600 dark:text-green-200/80">
                      No references available for this message.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    ))}

    {/* Loading indicator */}
    {isLoading && (
      <div className="flex justify-start">
        <div className="relative group max-w-[90%] md:max-w-[80%]">
          <div className="p-4 md:p-5 text-gray-900 dark:text-white animate-pulse">
            <div className="flex items-center gap-3">
              <div className="flex space-x-1">
                <div className="w-2.5 h-2.5 rounded-full animate-bounce bg-green-600 dark:bg-[#00A400]"></div>
                <div className="w-2.5 h-2.5 rounded-full animate-bounce bg-green-600 dark:bg-[#00A400]" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2.5 h-2.5 rounded-full animate-bounce bg-green-600 dark:bg-[#00A400]" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <span className="text-sm text-gray-900 dark:text-white font-medium">PANSGPT is thinking...</span>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
));

// Memoize the input area component
const InputArea = React.memo(({
  input,
  handleInputChange,
  setInput,
  handleSend,
  isLoading,
  isStreaming,
  handleStopStreaming,
  sidebarOpen
}: {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  setInput: (value: string) => void;
  handleSend: (e: React.FormEvent) => void;
  isLoading: boolean;
  isStreaming: boolean;
  handleStopStreaming: () => void;
  sidebarOpen: boolean;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height based on scrollHeight, with min and max constraints
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Ctrl+Enter or Cmd+Enter (Enter alone adds new line)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!isLoading && input.trim()) {
        handleSend(e);
      }
    }
  };

  return (
    <form
      onSubmit={handleSend}
      className={`fixed bottom-0 z-30 transition-all duration-300 ${sidebarOpen ? 'left-0 md:left-72 w-full md:w-[calc(100%-18rem)]' : 'left-0 md:left-20 w-full md:w-[calc(100%-5rem)]'} px-4 md:px-8 pb-4 md:pb-8 bg-transparent`}
    >
      <div className="rounded-2xl flex flex-col gap-3 px-3 md:px-8 py-4 md:py-6 max-w-6xl mx-auto border-2 transition-all duration-300 bg-white dark:[background-color:#0C120C] border-gray-200 dark:border-[#2D3A2D]" style={{ maxWidth: '72rem', boxSizing: 'border-box' }}
      >
        {/* Input field - textarea for multi-line support */}
        <textarea
          ref={textareaRef}
          placeholder={isLoading ? "PANSGPT is processing your message..." : "Ask a question from any course."}
          className="w-full bg-transparent outline-none text-sm md:text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/50 resize-none overflow-y-auto"
          style={{ minHeight: '24px', maxHeight: '200px' }}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
        />

        {/* Button group - Stop or Send button */}
        <div className="flex items-center justify-end gap-3 flex-shrink-0 w-full">
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStopStreaming}
              className="text-white p-2 md:p-3 rounded-xl font-semibold flex items-center justify-center transition-all duration-200 flex-shrink-0 bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800"
              title="Stop generating"
            >
              <StopIcon className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          ) : (
            <button
              type="submit"
              className="text-white p-2 md:p-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 flex-shrink-0 bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#008300]"
              disabled={isLoading || !input.trim()}
              title="Send message"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <PaperAirplaneIcon className="w-5 h-5 md:w-6 md:h-6" />
              )}
            </button>
          )}
        </div>
      </div>
    </form>
  );
});

function MainPageContent() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Supabase auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setUser(s?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Shim: session-like object for backward compat throughout the file
  const session = user ? { user: { id: user.id, name: user.user_metadata?.full_name || '', email: user.email } } : null;
  const status = authLoading ? 'loading' : (user ? 'authenticated' : 'unauthenticated');
  const historyMenuRef = useRef(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showCitationsFor, setShowCitationsFor] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");
  const [historyMenuIdx, setHistoryMenuIdx] = useState<number | null>(null);
  const [userLevel, setUserLevel] = useState<string>("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<ExtendedChatMessage[]>([]);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [feedbackMessageContent, setFeedbackMessageContent] = useState<string>('');
  const [feedbackUserPrompt, setFeedbackUserPrompt] = useState<string>('');
  const lastFeedbackPopupTime = useRef<number>(0);
  const messageCountSinceLastPopup = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Helper to get active conversation
  const activeConv = conversations.find(c => c.id === activeId);
  const messagesInConv = activeConv ? activeConv.messages : [];

  // Edit/copy handlers
  const handleCopy = async (idx: number, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1200);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleFeedback = async (idx: number, rating: 'thumbs_up' | 'thumbs_down') => {
    if (!session?.user?.id) return;

    const message = messagesInConv[idx];
    if (!message || message.role !== 'model') return;

    // Update local state immediately for better UX
    setMessages(prev => {
      const updated = [...prev];
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], feedback: rating };
      }
      return updated;
    });

    // Also update conversations state
    setConversations(prev => prev.map(c =>
      c.id === activeId
        ? {
          ...c,
          messages: c.messages.map((m, i) =>
            i === idx ? { ...m, feedback: rating } : m
          )
        }
        : c
    ));

    // Find the associated user prompt (the message before the AI response)
    let userPrompt = '';
    if (idx > 0 && messagesInConv[idx - 1].role === 'user') {
      userPrompt = messagesInConv[idx - 1].content;
    }

    // Send feedback to server
    try {
      await api.post('/feedback/message', {
        messageId: null,
        rating,
        messageContent: message.content,
        userPrompt,
      });
    } catch (error) {
      console.error('Failed to save feedback:', error);
      // Revert on error
      setMessages(prev => {
        const updated = [...prev];
        if (updated[idx]) {
          updated[idx] = { ...updated[idx], feedback: null };
        }
        return updated;
      });
    }
  };

  const handleEdit = (idx: number) => {
    if (messagesInConv[idx].role === 'user') {
      setEditingIdx(idx);
      setEditingText(messagesInConv[idx].content);
    }
  };


  // Streaming chat API helper
  async function streamChatApi(
    message: string,
    conversationHistory: ExtendedChatMessage[],
    onChunk: (chunk: string) => void,
    userLevel?: string,
    onCitations?: (citations: Array<{ lecturerName: string; documentTitle: string }>) => void,
    abortSignal?: AbortSignal
  ) {
    const response = await api.fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationHistory, userLevel }),
      signal: abortSignal,
    });
    if (!response.body) throw new Error('No response body');
    const reader = response.body.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        // Check if aborted before reading
        if (abortSignal?.aborted) {
          await reader.cancel();
          break;
        }
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              // Check if this is a citations metadata message
              if (parsed.type === 'citations' && parsed.citations && onCitations) {
                onCitations(parsed.citations);
              } else if (parsed.chunk) {
                // Regular content chunk
                onChunk(parsed.chunk);
              }
            } catch { }
          }
        }
      }
      if (buffer.trim() && !abortSignal?.aborted) {
        try {
          const parsed = JSON.parse(buffer);
          // Check if this is a citations metadata message
          if (parsed.type === 'citations' && parsed.citations && onCitations) {
            onCitations(parsed.citations);
          } else if (parsed.chunk) {
            // Regular content chunk
            onChunk(parsed.chunk);
          }
        } catch { }
      }
    } catch (error: any) {
      // If aborted, don't throw error
      if (error.name === 'AbortError' || abortSignal?.aborted) {
        await reader.cancel();
        return;
      }
      throw error;
    } finally {
      readerRef.current = null;
    }
  }

  // Stop streaming handler
  const handleStopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => { });
      readerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
  }, []);

  const handleEditSave = async (idx: number) => {
    if (!editingText.trim()) return;

    // Get the current active conversation to avoid stale closure
    const currentActiveConv = conversations.find(c => c.id === activeId);
    if (!currentActiveConv) return;

    const updatedMessages = [...currentActiveConv.messages];
    updatedMessages[idx] = {
      ...updatedMessages[idx],
      content: editingText.trim()
    };
    const messagesToKeep = updatedMessages.slice(0, idx + 1);
    const aiLoadingMessage = {
      role: 'model' as MessageRole,
      content: '', // Streaming will fill this
      hasContext: false,
      createdAt: new Date().toISOString(),
    };
    const newMessagesLoading = [...messagesToKeep, aiLoadingMessage];
    setConversations(prev => prev.map(c =>
      c.id === activeId
        ? { ...c, messages: newMessagesLoading }
        : c
    ));
    setMessages(newMessagesLoading);
    setEditingIdx(null);
    setEditingText("");
    setIsLoading(true);
    setIsStreaming(true);

    // Create AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await streamChatApi(
        editingText.trim(),
        messagesToKeep,
        (chunk) => {
          let text = chunk;
          // If chunk is a JSON string, extract the 'response' field
          try {
            const parsed = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;
            if (parsed && typeof parsed === 'object' && parsed.response) {
              text = parsed.response;
            }
          } catch { }
          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.role === 'model') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: updated[lastIdx].content + text,
                // Preserve existing citations if any
                citations: updated[lastIdx].citations,
              };
            }
            messagesRef.current = updated;
            return updated;
          });
        },
        userLevel,
        (citations) => {
          // Update the last message with citations
          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.role === 'model') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                citations: citations,
              };
            }
            messagesRef.current = updated;

            // Also update conversations state to preserve citations
            setConversations(prev => prev.map(c =>
              c.id === activeId
                ? { ...c, messages: updated }
                : c
            ));

            return updated;
          });
        },
        abortController.signal
      );

      // Clear abort controller reference if streaming completed successfully
      if (!abortController.signal.aborted) {
        abortControllerRef.current = null;
      }
      // Auto-save after streaming completes, using latest messages from ref
      // Wait a bit to ensure citations are set (they arrive after stream completes)
      await new Promise(resolve => setTimeout(resolve, 500));
      if (session?.user?.id) {
        const latestMessages = messagesRef.current;
        const payload = {
          id: activeId,
          title: currentActiveConv.name || 'Conversation',
          messages: latestMessages,
          userId: session.user.id
        };

        console.log('Saving edited conversation:', {
          activeId,
          hasActiveConv: !!currentActiveConv,
          messageCount: latestMessages.length,
          payload
        });

        const saveResponse = await api.post("/conversations", payload);

        if (saveResponse.ok) {
          const savedConversation = await saveResponse.json();
          console.log('Edited conversation saved successfully:', {
            conversationId: savedConversation.id,
            messageCount: savedConversation.messages?.length || 0
          });

          const updatedConversation = {
            id: savedConversation.id,
            name: savedConversation.title,
            messages: savedConversation.messages.map((msg: any) => ({
              role: msg.role as MessageRole,
              content: msg.content,
              createdAt: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : undefined,
              citations: msg.citations || undefined
            }))
          };

          // Update conversations list and set active conversation
          setConversations(prev => {
            const existingIndex = prev.findIndex(c => c.id === activeId);
            if (existingIndex >= 0) {
              // Update existing conversation
              const updated = [...prev];
              updated[existingIndex] = updatedConversation;
              return updated;
            } else {
              // Add new conversation to the beginning
              return [updatedConversation, ...prev];
            }
          });

          // Update active ID if it changed (for new conversations)
          if (savedConversation.id !== activeId) {
            setActiveId(savedConversation.id);
          }

          // Ensure messages are sorted by createdAt before setting
          const sortedLoadedMessages = [...updatedConversation.messages].sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateA - dateB;
          });
          setMessages(sortedLoadedMessages);
        } else {
          console.error('Failed to save edited conversation:', saveResponse.status, saveResponse.statusText);
          const errorText = await saveResponse.text();
          console.error('Error details:', errorText);
        }
      }
    } catch (error: any) {
      // Don't show error message if user aborted the request
      if (error.name !== 'AbortError' && !abortController.signal.aborted) {
        console.error('Error in handleEditSave:', error);
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          // Only show error if the last message is empty or incomplete
          if (updated[lastIdx]?.role === 'model' && (!updated[lastIdx].content || updated[lastIdx].content.trim().length === 0)) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: 'I apologize, but I encountered an error. Please try again.'
            };
          }
          return updated;
        });
      }
    } finally {
      // Only clear loading states if not aborted, or if aborted, clear them anyway
      if (!abortControllerRef.current || abortController.signal.aborted) {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleEditCancel = () => {
    setEditingIdx(null);
    setEditingText("");
  };

  // Close dropdowns on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (historyMenuRef.current && !(historyMenuRef.current as any).contains(e.target)) {
        setHistoryMenuIdx(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // New chat
  async function handleNewChat() {
    if (!session?.user?.id) return;
    try {
      // Create a temporary conversation (not saved to database yet)
      const tempId = `temp_${Date.now()}`;
      const tempConversation = {
        id: tempId,
        name: "New Conversation",
        messages: []
      };

      setConversations(prev => [tempConversation, ...prev]);
      setActiveId(tempId);
      setMessages([]);
      setEditingIdx(null);
      setEditingText("");

      // Navigate to clean URL without conversation ID
      router.push('/main');

      console.log('Created temporary conversation for new chat:', {
        tempConversationId: tempId
      });
    } catch (err) {
      console.error("Error creating new conversation:", err);
    }
  }

  // Load user's conversations on mount and subscription status
  useEffect(() => {
    async function loadData() {
      if (session?.user?.id) {
        try {
          // Load conversations from database
          const response = await api.get(`/conversations?userId=${session.user.id}&limit=50&messageLimit=50`);
          const data = await response.json();

          console.log('Loaded conversations from database:', {
            hasData: !!data,
            conversationsCount: data.conversations?.length || 0,
            firstConversation: data.conversations?.[0] ? {
              id: data.conversations[0].id,
              title: data.conversations[0].title,
              messageCount: data.conversations[0].messages?.length || 0
            } : null
          });

          // Check if there's a conversation ID in the URL
          const conversationIdFromUrl = searchParams.get('conversation');

          if (conversationIdFromUrl) {
            // Try to load the specific conversation from URL
            console.log('Loading conversation from URL:', conversationIdFromUrl);
            await loadConversationFromUrl(conversationIdFromUrl, data.conversations || []);
            // Store the active conversation ID
            if (typeof window !== 'undefined') {
              localStorage.setItem('ai_activeId', conversationIdFromUrl);
            }
          } else {
            // No conversation ID in URL - check localStorage for previous conversation
            const storedActiveId = typeof window !== 'undefined' ? localStorage.getItem('ai_activeId') : null;

            if (storedActiveId && !storedActiveId.startsWith('temp_')) {
              // Check if the stored conversation exists in the loaded conversations
              const storedConv = data.conversations?.find((conv: any) => conv.id === storedActiveId);
              if (storedConv) {
                console.log('Restoring previous conversation from localStorage:', storedActiveId);
                await loadConversationFromUrl(storedActiveId, data.conversations || []);
              } else {
                // Stored conversation doesn't exist, try to fetch it
                console.log('Stored conversation not in list, fetching directly:', storedActiveId);
                try {
                  const fetchResponse = await api.get(`/conversations/${storedActiveId}`);
                  if (fetchResponse.ok) {
                    const fetchData = await fetchResponse.json();
                    const conversation = fetchData.conversation;
                    const formattedConversation = {
                      id: conversation.id,
                      name: conversation.title,
                      messages: conversation.messages.map((msg: any) => ({
                        role: msg.role as MessageRole,
                        content: msg.content,
                        createdAt: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : undefined,
                        citations: msg.citations || undefined
                      }))
                    };
                    const allConversations = [formattedConversation, ...(data.conversations || []).map((conv: any) => ({
                      id: conv.id,
                      name: conv.title,
                      messages: conv.messages.map((msg: any) => ({
                        role: msg.role as MessageRole,
                        content: msg.content,
                        createdAt: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : undefined,
                        citations: msg.citations || undefined
                      }))
                    }))];
                    setConversations(allConversations);
                    setActiveId(storedActiveId);
                    const sortedMessages = [...formattedConversation.messages].sort((a, b) => {
                      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                      return dateA - dateB;
                    });
                    setMessages(sortedMessages);
                    // Update URL to include conversation ID
                    router.push(`/main?conversation=${storedActiveId}`);
                  } else {
                    // Conversation not found, create new one
                    console.log('Stored conversation not found, creating new conversation');
                    await createNewConversation();
                  }
                } catch (err) {
                  console.error('Error fetching stored conversation:', err);
                  await createNewConversation();
                }
              }
            } else {
              // No stored conversation - create a new conversation
              console.log('No conversation ID in URL and no stored conversation, creating new conversation');
              await createNewConversation();
            }
          }
        } catch (err) {
          console.error("Error loading user data:", err);
          // Create a new conversation if there's an error
          await createNewConversation();
        }
      }
    }
    loadData();
  }, [session?.user?.id, searchParams]);

  // Function to load a specific conversation from URL
  const loadConversationFromUrl = async (conversationId: string, existingConversations: any[]) => {
    if (!session?.user?.id) return;

    try {
      // First check if the conversation is already in our loaded conversations
      const existingConv = existingConversations.find(conv => conv.id === conversationId);

      if (existingConv) {
        // Convert to our format and set as active
        const formattedConversations = existingConversations.map((conv: any) => ({
          id: conv.id,
          name: conv.title,
          messages: conv.messages.map((msg: any) => ({
            role: msg.role as MessageRole,
            content: msg.content,
            createdAt: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : undefined,
            citations: msg.citations || undefined
          }))
        }));

        setConversations(formattedConversations);
        setActiveId(conversationId);
        const sortedExistingMessages = [...existingConv.messages].sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        });
        setMessages(sortedExistingMessages.map((msg: any) => ({
          role: msg.role as MessageRole,
          content: msg.content,
          createdAt: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : undefined,
          citations: msg.citations || undefined
        })));

        console.log('Loaded existing conversation from URL:', {
          conversationId,
          messageCount: existingConv.messages.length
        });
        return;
      }

      // If not found in loaded conversations, try to fetch it directly
      console.log('Conversation not in loaded list, fetching directly:', conversationId);
      const response = await api.get(`/conversations/${conversationId}`);

      if (response.ok) {
        const data = await response.json();
        const conversation = data.conversation;

        // Convert to our format
        const formattedConversation = {
          id: conversation.id,
          name: conversation.title,
          messages: conversation.messages.map((msg: any) => ({
            role: msg.role as MessageRole,
            content: msg.content,
            createdAt: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : undefined,
            citations: msg.citations || undefined
          }))
        };

        // Add this conversation to the list and set as active
        const allConversations = [formattedConversation, ...existingConversations.map((conv: any) => ({
          id: conv.id,
          name: conv.title,
          messages: conv.messages.map((msg: any) => ({
            role: msg.role as MessageRole,
            content: msg.content,
            createdAt: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : undefined,
            citations: msg.citations || undefined
          }))
        }))];

        setConversations(allConversations);
        setActiveId(conversationId);
        const sortedFormattedMessages = [...formattedConversation.messages].sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        });
        setMessages(sortedFormattedMessages);

        console.log('Loaded conversation directly from API:', {
          conversationId,
          messageCount: conversation.messages.length
        });
      } else {
        console.log('Conversation not found, creating new one instead');
        await createNewConversation();
      }
    } catch (err) {
      console.error("Error loading conversation from URL:", err);
      await createNewConversation();
    }
  };

  // Function to create a new conversation (UI-only, not saved to database until first message)
  const createNewConversation = async () => {
    if (!session?.user?.id) return;

    try {
      // Load existing conversations for the sidebar
      const conversationsResponse = await api.get(`/conversations?userId=${session.user.id}&limit=50&messageLimit=50`);
      const conversationsData = await conversationsResponse.json();

      let existingConversations = [];
      if (conversationsData.conversations && conversationsData.conversations.length > 0) {
        existingConversations = conversationsData.conversations.map((conv: any) => ({
          id: conv.id,
          name: conv.title,
          messages: conv.messages.map((msg: any) => ({
            role: msg.role as MessageRole,
            content: msg.content,
            createdAt: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : undefined,
            citations: msg.citations || undefined
          }))
        }));
      }

      // Create a temporary conversation (not saved to database yet)
      const tempId = `temp_${Date.now()}`;
      const tempConversation = {
        id: tempId,
        name: "New Conversation",
        messages: []
      };

      // Add the temporary conversation to the beginning of the list
      const allConversations = [tempConversation, ...existingConversations];
      setConversations(allConversations);
      setActiveId(tempId);
      setMessages([]);

      console.log('Created temporary conversation (not saved to database yet):', {
        tempConversationId: tempId,
        totalConversations: allConversations.length
      });
    } catch (err) {
      console.error("Error creating new conversation:", err);
    }
  };

  // Store activeId in localStorage to restore when navigating back
  useEffect(() => {
    if (activeId && typeof window !== 'undefined' && !activeId.startsWith('temp_')) {
      localStorage.setItem('ai_activeId', activeId);
    }
  }, [activeId]);

  // Memoize sorted messages to prevent unnecessary sorting
  // Always sort by createdAt to ensure consistent ordering
  const sortedMessages = useMemo(() => {
    if (!activeConv || !activeConv.messages || activeConv.messages.length === 0) return [];
    // Create a stable sorted copy - messages should already be sorted from DB, but ensure consistency
    const messages = [...activeConv.messages];
    return messages.sort((a, b) => {
      // Use createdAt if available
      if (a.createdAt && b.createdAt) {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB;
      }
      // If one has createdAt and the other doesn't, prioritize the one with timestamp
      if (a.createdAt && !b.createdAt) return -1;
      if (!a.createdAt && b.createdAt) return 1;
      // If neither has createdAt, maintain original order (shouldn't happen)
      return 0;
    });
  }, [activeConv?.id, activeConv?.messages]);

  // Update messages when sorted messages change
  useEffect(() => {
    setMessages(sortedMessages);
  }, [sortedMessages]);

  // Auto-scroll to bottom when messages change, but only if user is near bottom or not streaming
  useEffect(() => {
    if (chatEndRef.current) {
      const chatContainer = (window as any).chatContainer;
      if (chatContainer) {
        const isNearBottom = chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 100;
        // Only auto-scroll if user is near bottom OR if we're not currently streaming
        if (isNearBottom || !isStreaming) {
          chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }, [messages, isStreaming]);

  // Handle scroll events to show/hide scroll to bottom button
  useEffect(() => {
    const chatContainer = (window as any).chatContainer;
    if (!chatContainer) return;

    const handleScroll = () => {
      const isNearBottom = chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 100;
      setShowScrollButton(!isNearBottom && isStreaming);
    };

    chatContainer.addEventListener('scroll', handleScroll);
    return () => chatContainer.removeEventListener('scroll', handleScroll);
  }, [isStreaming]);

  // Update messagesRef whenever messages change
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Memoize the input handler
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  // Fetch user level on mount, when session changes, or periodically
  useEffect(() => {
    async function fetchLevel() {
      if (session?.user) {
        try {
          const res = await api.get('/user/profile');
          if (res.ok) {
            const data = await res.json();
            if (data.user?.level) setUserLevel(data.user.level);
          }
        } catch { }
      }
    }
    fetchLevel();

    // Refresh level every 30 seconds to catch profile updates
    const interval = setInterval(fetchLevel, 30000);

    // Also refresh when window regains focus (user might have updated profile in another tab)
    const handleFocus = () => fetchLevel();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [session]);

  // Send message - Database-first approach with immediate UI update
  const handleSend = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setIsLoading(true);
    const userMessage: ExtendedChatMessage = {
      role: 'user',
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };
    const aiLoadingMessage: ExtendedChatMessage = {
      role: 'model',
      content: '', // Streaming will fill this
      createdAt: new Date().toISOString(),
    };
    const newMessages = [...(activeConv?.messages || []), userMessage, aiLoadingMessage];
    setMessages(newMessages);
    setConversations(prev => prev.map(c =>
      c.id === activeId
        ? { ...c, messages: newMessages }
        : c
    ));
    setInput('');
    setIsStreaming(true);

    // Create AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await streamChatApi(
        userMessage.content,
        [...(activeConv?.messages || []), userMessage],
        (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.role === 'model') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: updated[lastIdx].content + chunk,
                // Preserve existing citations if any
                citations: updated[lastIdx].citations,
              };
            }
            messagesRef.current = updated;
            return updated;
          });
        },
        userLevel,
        (citations) => {
          // Update the last message with citations
          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.role === 'model') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                citations: citations,
              };
            }
            messagesRef.current = updated;

            // Also update conversations state to preserve citations
            setConversations(prev => prev.map(c =>
              c.id === activeId
                ? { ...c, messages: updated }
                : c
            ));

            return updated;
          });
        },
        abortController.signal
      );

      // Clear abort controller reference if streaming completed successfully
      if (!abortController.signal.aborted) {
        abortControllerRef.current = null;
      }

      // Check if we should show feedback popup (every 25th AI response, at least 5 minutes apart)
      messageCountSinceLastPopup.current += 1;
      const now = Date.now();
      const timeSinceLastPopup = now - lastFeedbackPopupTime.current;
      const fiveMinutes = 5 * 60 * 1000;

      if (messageCountSinceLastPopup.current >= 25 && timeSinceLastPopup >= fiveMinutes) {
        const lastMessage = messagesRef.current[messagesRef.current.length - 1];
        if (lastMessage && lastMessage.role === 'model' && lastMessage.content) {
          setFeedbackMessageContent(lastMessage.content);
          // Find the user prompt that triggered this AI response
          const messagesLength = messagesRef.current.length;
          if (messagesLength >= 2 && messagesRef.current[messagesLength - 2].role === 'user') {
            setFeedbackUserPrompt(messagesRef.current[messagesLength - 2].content);
          } else {
            setFeedbackUserPrompt('');
          }
          setShowFeedbackPopup(true);
          lastFeedbackPopupTime.current = now;
          messageCountSinceLastPopup.current = 0;
        }
      }

      // Auto-save after streaming completes, using latest messages from ref
      // Wait a bit to ensure citations are set (they arrive after stream completes)
      await new Promise(resolve => setTimeout(resolve, 500));
      if (session?.user?.id) {
        const latestMessages = messagesRef.current;

        // Check if this is a temporary conversation (first message)
        const isTemporaryConversation = activeId?.startsWith('temp_');

        // Generate title from AI's first response if this is a new conversation or has default title
        let conversationTitle = activeConv?.name || 'Conversation';

        // Only generate title from AI response if:
        // 1. It's a temporary conversation (first message), OR
        // 2. The conversation has a default title AND this appears to be the first AI response
        const shouldGenerateFromAI = isTemporaryConversation ||
          (isDefaultTitle(conversationTitle) && latestMessages.filter(msg => msg.role === 'model').length === 1);

        if (shouldGenerateFromAI && latestMessages.length > 0) {
          // Find the first AI response (model role message)
          const firstAIResponse = latestMessages.find(msg => msg.role === 'model' && msg.content && msg.content.trim().length > 0);

          if (firstAIResponse && firstAIResponse.content) {
            try {
              // Call API to generate title from AI's first response
              const titleResponse = await api.post('/generate-title', { aiResponse: firstAIResponse.content });

              if (titleResponse.ok) {
                const titleData = await titleResponse.json();
                if (titleData.title) {
                  conversationTitle = titleData.title;
                } else {
                  // Fallback to simple generation if API didn't return a title
                  conversationTitle = generateConversationTitle(firstAIResponse.content);
                }
              } else {
                // Fallback to simple generation if API call failed
                conversationTitle = generateConversationTitle(firstAIResponse.content);
              }
            } catch (error) {
              console.error('Error generating AI title:', error);
              // Fallback to simple generation on error
              conversationTitle = generateConversationTitle(firstAIResponse.content);
            }
          } else {
            // Fallback: if no AI response yet, use first user message
            const firstUserMessage = latestMessages.find(msg => msg.role === 'user');
            if (firstUserMessage) {
              conversationTitle = generateConversationTitle(firstUserMessage.content);
            }
          }
        }

        if (isTemporaryConversation) {
          // This is the first message in a temporary conversation - create it in the database
          console.log('Creating new conversation in database for first message');

          const payload = {
            title: conversationTitle,
            messages: latestMessages,
            userId: session.user.id
          };

          const saveResponse = await api.post("/conversations", payload);

          if (saveResponse.ok) {
            const savedConversation = await saveResponse.json();
            console.log('New conversation created in database:', {
              conversationId: savedConversation.id,
              messageCount: savedConversation.messages?.length || 0
            });

            const updatedConversation = {
              id: savedConversation.id,
              name: savedConversation.title,
              messages: savedConversation.messages.map((msg: any) => ({
                role: msg.role as MessageRole,
                content: msg.content,
                createdAt: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : undefined,
                citations: msg.citations || undefined
              }))
            };

            // Replace the temporary conversation with the real one
            setConversations(prev => {
              const updated = [...prev];
              const tempIndex = updated.findIndex(c => c.id === activeId);
              if (tempIndex >= 0) {
                updated[tempIndex] = updatedConversation;
              }
              return updated;
            });

            // Update active ID to the real conversation ID
            setActiveId(savedConversation.id);
            // Merge citations from current messages if they exist
            const currentMessages = messagesRef.current;
            const mergedMessages = updatedConversation.messages.map((savedMsg: ExtendedChatMessage, idx: number) => {
              const currentMsg = currentMessages[idx];
              if (currentMsg && currentMsg.citations && !savedMsg.citations) {
                return { ...savedMsg, citations: currentMsg.citations };
              }
              return savedMsg;
            });
            const sortedMergedMessages = [...mergedMessages].sort((a, b) => {
              const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return dateA - dateB;
            });
            setMessages(sortedMergedMessages);

            // Update URL with the real conversation ID
            router.push(`/main?conversation=${savedConversation.id}`);
          } else {
            console.error('Failed to create conversation:', saveResponse.status, saveResponse.statusText);
            const errorText = await saveResponse.text();
            console.error('Error details:', errorText);
          }
        } else {
          // This is an existing conversation - update it
          const payload = {
            id: activeId,
            title: conversationTitle,
            messages: latestMessages,
            userId: session.user.id
          };

          console.log('Updating existing conversation:', {
            activeId,
            hasActiveConv: !!activeConv,
            messageCount: latestMessages.length,
            payload
          });

          const saveResponse = await api.post("/conversations", payload);

          if (saveResponse.ok) {
            const savedConversation = await saveResponse.json();
            console.log('Conversation updated successfully:', {
              conversationId: savedConversation.id,
              messageCount: savedConversation.messages?.length || 0
            });

            const updatedConversation = {
              id: savedConversation.id,
              name: savedConversation.title,
              messages: savedConversation.messages.map((msg: any) => ({
                role: msg.role as MessageRole,
                content: msg.content,
                createdAt: msg.createdAt ? (typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString()) : undefined,
                citations: msg.citations || undefined
              }))
            };

            // Update conversations list
            setConversations(prev => {
              const existingIndex = prev.findIndex(c => c.id === activeId);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = updatedConversation;
                return updated;
              }
              return prev;
            });

            // Merge citations from current messages if they exist
            const currentMessages = messagesRef.current;
            const mergedMessages = updatedConversation.messages.map((savedMsg: ExtendedChatMessage, idx: number) => {
              const currentMsg = currentMessages[idx];
              if (currentMsg && currentMsg.citations && !savedMsg.citations) {
                return { ...savedMsg, citations: currentMsg.citations };
              }
              return savedMsg;
            });
            const sortedMergedMessages = [...mergedMessages].sort((a, b) => {
              const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return dateA - dateB;
            });
            setMessages(sortedMergedMessages);
          } else {
            console.error('Failed to update conversation:', saveResponse.status, saveResponse.statusText);
            const errorText = await saveResponse.text();
            console.error('Error details:', errorText);
          }
        }
      }
    } catch (error: any) {
      // Don't show error message if user aborted the request
      if (error.name !== 'AbortError' && !abortController.signal.aborted) {
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          // Only show error if the last message is empty or incomplete
          if (updated[lastIdx]?.role === 'model' && (!updated[lastIdx].content || updated[lastIdx].content.trim().length === 0)) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: 'I apologize, but I encountered an error. Please try again.'
            };
          }
          return updated;
        });
      }
    } finally {
      // Only clear loading states if not aborted, or if aborted, clear them anyway
      if (!abortControllerRef.current || abortController.signal.aborted) {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    }
  }, [input, isLoading, activeConv, activeId, session?.user?.id, messages, userLevel]);

  // Chat history actions
  function handleSelectConv(id: string) {
    setActiveId(id);
    setEditingIdx(null);
    setEditingText("");

    // Update URL with conversation ID (only for real conversations, not temp ones)
    if (!id.startsWith('temp_')) {
      router.push(`/main?conversation=${id}`);
    } else {
      router.push('/main');
    }

    // Close sidebar on mobile when conversation is selected
    // Use a more reliable method to check if we're on mobile
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isMobile) {
      setSidebarOpen(false);
    }
  }
  async function handleDeleteConv(idx: number) {
    const convToDelete = conversations[idx];
    if (!convToDelete || !session?.user?.id) return;

    try {
      const response = await api.delete(`/conversations/${convToDelete.id}`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to delete conversation:', errorData.error);
        alert(`Failed to delete conversation: ${errorData.error}`);
        return;
      }

      // Update local state after successful deletion
      setConversations(prev => prev.filter((_, i) => i !== idx));
      if (conversations[idx]?.id === activeId) {
        // If deleting active, switch to another or create new one
        if (conversations.length > 1) {
          setActiveId(conversations[(idx === 0 ? 1 : 0)].id);
        } else {
          // If this was the last conversation, create a new one
          const newId = Date.now().toString();
          const newConversation = { id: newId, name: 'New Conversation', messages: [] };
          setConversations([newConversation]);
          setActiveId(newId);
          setMessages([]);
        }
      }
      setHistoryMenuIdx(null);
    } catch (err) {
      console.error('Error deleting conversation:', err);
      alert('Failed to delete conversation. Please try again.');
    }
  }
  function handleRenameConv(idx: number) {
    setRenamingIdx(idx);
    setRenameText(conversations[idx].name);
    setHistoryMenuIdx(null);
  }
  async function handleRenameSave(idx: number) {
    const conv = conversations[idx];
    const updatedName = renameText.trim();
    if (!updatedName || !conv) {
      setRenamingIdx(null);
      setRenameText("");
      return;
    }

    // Update UI immediately
    setConversations(prev => prev.map((c, i) => i === idx ? { ...c, name: updatedName } : c));
    setRenamingIdx(null);
    setRenameText("");

    // Persist to backend using the new PATCH endpoint
    try {
      const response = await api.fetch(`/conversations/${conv.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: updatedName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to rename conversation:', errorData.error);

        // Revert UI change on failure
        setConversations(prev => prev.map((c, i) => i === idx ? { ...c, name: conv.name } : c));
        alert(`Failed to rename conversation: ${errorData.error}`);
        return;
      }

      const result = await response.json();
      console.log('Conversation renamed successfully:', result);

    } catch (err) {
      console.error('Error renaming conversation:', err);

      // Revert UI change on failure
      setConversations(prev => prev.map((c, i) => i === idx ? { ...c, name: conv.name } : c));
      alert('Failed to rename conversation. Please try again.');
    }
  }
  function handleRenameCancel() {
    setRenamingIdx(null);
    setRenameText("");
  }


  // Add authentication check
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Handle logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // Handle window resize to manage sidebar state
  useEffect(() => {
    const handleResize = () => {
      // Only auto-open sidebar on desktop, don't force close on mobile resize
      if (window.innerWidth >= 768) { // md breakpoint and above
        setSidebarOpen(true); // Keep sidebar open on desktop
      }
      // Don't force close on mobile - let user control it
    };

    // Set initial state based on screen size
    if (window.innerWidth >= 768) {
      setSidebarOpen(true);
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  // Prevent background scroll when sidebar is open (mobile)
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [sidebarOpen]);

  // Don't render anything while checking authentication
  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-white dark:bg-black text-gray-800 dark:text-white items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden text-gray-800 dark:text-white bg-gray-50 dark:[background-color:#0C120C]">
      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[55] md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar - Always visible collapsed, expands when sidebarOpen */}
      <aside className={`h-[100dvh] fixed left-0 top-0 flex flex-col transition-all duration-300 ${sidebarOpen
        ? 'w-[85vw] md:w-72 border-r border-gray-200 dark:border-white/10 bg-white dark:[background-color:#2D3A2D] z-[60]'
        : 'w-0 md:w-20 z-50'
        }`}>
        {/* Sidebar toggle button - always visible on mobile when collapsed */}
        <div className={`${sidebarOpen ? 'px-4 pt-4 pb-3' : 'p-3 md:px-4 md:pt-4 md:pb-3'} flex items-center justify-start ${!sidebarOpen ? 'md:border-r md:border-gray-200 dark:md:border-white/10' : ''}`}>
          <button
            className="flex items-center justify-center text-gray-700 dark:text-white transition-all duration-200 hover:opacity-80 z-50 bg-gray-100 dark:bg-[#2D3A2D] rounded-lg p-2"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* New Chat button */}
        <div className={`px-4 ${sidebarOpen ? 'pt-8 mb-4' : 'pt-6 mb-2 hidden md:block'}`}>
          <div className={!sidebarOpen ? 'flex justify-center' : ''}>
            <button
              className={`${sidebarOpen ? 'w-full px-4 py-3 rounded-xl flex items-center gap-3' : 'w-12 h-12 rounded-xl flex items-center justify-center'} text-gray-700 dark:text-white text-sm font-medium transition-all duration-200 border border-green-300 dark:border-green-600/30 bg-green-50 dark:bg-transparent hover:bg-green-100 dark:hover:bg-transparent hover:border-green-400 dark:hover:border-green-600/50`}
              onClick={handleNewChat}
              title="New Chat"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                <circle cx="21" cy="5" r="1.5" fill="currentColor" />
              </svg>
              {sidebarOpen && <span>New Chat</span>}
            </button>
          </div>
        </div>

        {/* Study Mode entry */}
        <div className={`px-4 ${sidebarOpen ? 'mb-2' : 'mb-2 hidden md:block'}`}>
          <div className={!sidebarOpen ? 'flex justify-center' : ''}>
            <button
              className={`${sidebarOpen ? 'w-full px-4 py-3 rounded-xl flex items-center gap-3' : 'w-12 h-12 rounded-xl flex items-center justify-center'} text-gray-700 dark:text-white text-sm font-medium transition-all duration-200 hover:bg-gray-100 dark:hover:bg-white/5`}
              onClick={() => window.location.href = '/reader'}
              title="Study Mode"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              {sidebarOpen && <span>Study Mode</span>}
            </button>
          </div>
        </div>

        {/* Take A Quiz entry */}
        <div className={`px-4 ${sidebarOpen ? 'mb-4' : 'mb-2 hidden md:block'}`}>
          <div className={!sidebarOpen ? 'flex justify-center' : ''}>
            <button
              className={`${sidebarOpen ? 'w-full px-4 py-3 rounded-xl flex items-center gap-3' : 'w-12 h-12 rounded-xl flex items-center justify-center'} text-gray-700 dark:text-white text-sm font-medium transition-all duration-200 hover:bg-gray-100 dark:hover:bg-white/5`}
              onClick={() => window.location.href = '/quiz'}
              title="Take A Quiz"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
              {sidebarOpen && <span>Take A Quiz</span>}
            </button>
          </div>
        </div>

        {/* History section - only visible when expanded */}
        {(sidebarOpen) && (
          <>
            {/* History label */}
            <div className="px-4 mb-3">
              <div className="text-sm font-semibold text-green-600 dark:text-[#4ade80]">History</div>
            </div>

            {/* Chat history (scrollable only here) */}
            <div className="flex-1 flex flex-col px-4 min-h-0">
              <div className="flex-1 overflow-y-auto pr-2 min-h-0">
                <ul className="space-y-1">
                  {conversations.map((conv, idx) => (
                    <li
                      key={conv.id}
                      className={`px-4 py-3 rounded-xl cursor-pointer text-sm flex items-center justify-between transition-all duration-200 ${conv.id === activeId ? "text-gray-900 dark:text-white border border-green-300 dark:border-green-600/30 bg-green-50 dark:bg-green-900/10" : "text-gray-700 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white border border-transparent"}`}
                      onClick={() => handleSelectConv(conv.id)}
                    >
                      {renamingIdx === idx ? (
                        <form
                          onSubmit={e => { e.preventDefault(); handleRenameSave(idx); }}
                          className="flex-1 flex gap-2 items-center"
                        >
                          <input
                            className="bg-gray-100 dark:bg-white/20 text-gray-900 dark:text-white rounded px-2 py-1 text-xs border border-gray-300 dark:border-white/30 flex-1 placeholder-gray-400 dark:placeholder-white/50"
                            value={renameText || ""}
                            onChange={e => setRenameText(e.target.value)}
                            autoFocus
                          />
                          <button type="submit" className="text-gray-900 dark:text-white text-xs font-semibold hover:text-gray-700 dark:hover:text-white/80">Save</button>
                          <button type="button" className="text-gray-600 dark:text-white/70 text-xs font-semibold hover:text-gray-900 dark:hover:text-white" onClick={handleRenameCancel}>Cancel</button>
                        </form>
                      ) : (
                        <>
                          <span className="truncate flex-1">{conv.name}</span>
                          {/* Three-dot menu (desktop only) */}
                          <div className="relative" ref={historyMenuRef}>
                            <button
                              className="p-1 ml-2 rounded hover:bg-gray-200 dark:hover:bg-white/20 text-gray-600 dark:text-white/80"
                              onClick={e => { e.stopPropagation(); setHistoryMenuIdx(idx === historyMenuIdx ? null : idx); }}
                            >
                              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="5" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="12" cy="19" r="2" />
                              </svg>
                            </button>
                            {historyMenuIdx === idx && (
                              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#2D3A2D] backdrop-blur-xl rounded-xl py-2 z-50 border border-gray-200 dark:border-white/10 overflow-hidden">
                                <button
                                  className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-gray-700 dark:text-white group"
                                  onClick={e => { e.stopPropagation(); handleRenameConv(idx); }}
                                >
                                  <PencilIcon className="w-4 h-4 text-gray-500 dark:text-white/70 group-hover:text-gray-700 dark:group-hover:text-white transition-colors flex-shrink-0" />
                                  <span className="text-sm font-medium">Rename</span>
                                </button>
                                <div className="h-px bg-gray-200 dark:bg-white/10 mx-2 my-1"></div>
                                <button
                                  className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 transition-colors text-gray-700 dark:text-white group"
                                  onClick={e => { e.stopPropagation(); handleDeleteConv(idx); }}
                                >
                                  <svg className="w-4 h-4 text-gray-500 dark:text-white/70 group-hover:text-red-600 dark:group-hover:text-red-300 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  <span className="text-sm font-medium">Delete conversation</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}

        {/* Settings link at bottom of sidebar */}
        <div className={`px-4 pb-4 mt-auto ${sidebarOpen ? '' : 'hidden md:block'}`}>
          <div className={!sidebarOpen ? 'flex justify-center' : ''}>
            <button
              className={`${sidebarOpen ? 'w-full px-4 py-3 rounded-xl flex items-center gap-3' : 'w-12 h-12 rounded-xl flex items-center justify-center'} text-gray-700 dark:text-white text-sm font-medium transition-all duration-200 hover:bg-gray-100 dark:hover:bg-white/5`}
              onClick={() => router.push('/settings')}
              title="Settings and Help"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {sidebarOpen && <span>Settings and Help</span>}
            </button>
          </div>
        </div>
      </aside>
      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col h-[100dvh] bg-transparent transition-all duration-300 overflow-hidden w-0 min-w-0 ${sidebarOpen ? 'md:ml-72' : 'md:ml-20'}`}>
        {/* Top Bar - Fixed */}
        <div className={`fixed top-0 right-0 z-40 flex items-center justify-center px-3 md:px-6 h-16 md:h-20 transition-all duration-300 border-b border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:[background-color:#0C120C] ${sidebarOpen ? 'left-0 md:left-72 w-full md:w-[calc(100%-18rem)]' : 'left-0 md:left-20 w-full md:w-[calc(100%-5rem)]'
          }`}>
          {/* Constrained content container - matches conversation and input width */}
          <div className="w-full max-w-6xl mx-auto flex items-center gap-2 md:gap-4 overflow-hidden" style={{ maxWidth: '72rem', boxSizing: 'border-box' }}>
            {/* Logo */}
            <div className="flex items-center justify-center ml-14 md:ml-4 h-full">
              <div className="w-20 h-20 md:w-40 md:h-40 relative flex-shrink-0">
                <Image
                  src="/uploads/Logo 2.png"
                  alt="PansGPT Logo"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            {/* Left: empty for spacing on mobile, hidden on desktop */}
            <div className="w-8 md:hidden" />
            {/* Center: Empty space - centered on mobile, right on desktop */}
            <div className="flex-1 flex justify-center md:justify-end items-center gap-3">
            </div>
            {/* Right: User profile */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 md:w-8 md:h-8 relative cursor-pointer" onClick={() => router.push('/profile')}>
                <Image
                  src="/uploads/user-placeholder.png"
                  alt="User"
                  fill
                  className="rounded-full object-cover"
                  title="View Profile"
                />
              </div>
            </div>
          </div>
        </div>
        {/* Chat Area - Full width scroll container with scrollbar at edge */}
        <div className={`flex-1 min-h-0 overflow-y-auto pt-20 md:pt-24 pb-32 md:pb-40 bg-transparent ${messages.length === 0 ? 'scrollbar-hidden' : 'scrollbar-thin'}`}
          ref={(el) => {
            if (el) {
              // Store reference for scroll detection
              (window as any).chatContainer = el;
            }
          }}
        >
          {messages.length === 0 ? (
            <div className="w-full max-w-6xl mx-auto px-4 md:px-8 flex-1 flex items-center justify-center min-h-[calc(100vh-200px)]" style={{ maxWidth: '72rem', boxSizing: 'border-box' }}>
              <div className="text-center space-y-4 w-full">
                <span className="text-3xl md:text-6xl font-bold text-gray-900 dark:text-white">
                  Hello, Pharm. {session?.user?.name ? session.user.name.split(' ')[0] : ''}
                </span>
                <p className="text-lg md:text-xl text-gray-700 dark:text-white font-light">
                  Ask me anything about your courses
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-6xl mx-auto px-4 md:px-8 flex flex-col gap-6 md:gap-8 mb-20 md:mb-24" style={{ maxWidth: '72rem', boxSizing: 'border-box' }}>
              <MessageList
                messages={messages}
                editingIdx={editingIdx}
                editingText={editingText}
                setEditingText={setEditingText}
                copiedIdx={copiedIdx}
                handleEdit={handleEdit}
                handleEditCancel={handleEditCancel}
                handleEditSave={handleEditSave}
                handleCopy={handleCopy}
                isLoading={isLoading}
                showCitationsFor={showCitationsFor}
                setShowCitationsFor={setShowCitationsFor}
                handleFeedback={handleFeedback}
              />
              <div ref={chatEndRef} />

              {/* Scroll to bottom button - only show when streaming and user has scrolled up */}
              {showScrollButton && (
                <button
                  onClick={() => {
                    if (chatEndRef.current) {
                      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className="fixed bottom-20 right-4 md:right-8 z-30 text-white p-3 rounded-full transition-all duration-200 bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#008300]"
                  title="Scroll to latest message"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
        {/* Input Area */}
        <InputArea
          input={input}
          handleInputChange={handleInputChange}
          setInput={setInput}
          handleSend={handleSend}
          isLoading={isLoading}
          isStreaming={isStreaming}
          handleStopStreaming={handleStopStreaming}
          sidebarOpen={sidebarOpen}
        />
      </div>

      {/* Feedback Popup */}
      <FeedbackPopup
        isOpen={showFeedbackPopup}
        onClose={() => setShowFeedbackPopup(false)}
        onSubmit={async (feedbackText) => {
          try {
            await api.post('/feedback/message', {
              messageId: null,
              rating: 'popup_feedback',
              feedback: feedbackText,
              messageContent: feedbackMessageContent,
              userPrompt: feedbackUserPrompt,
            });
          } catch (error) {
            console.error('Failed to submit feedback:', error);
          }
        }}
        messageContent={feedbackMessageContent}
      />
    </div>
  );
}

export default function MainPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-white dark:bg-black text-gray-800 dark:text-white items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    }>
      <MainPageContent />
    </Suspense>
  );
} 