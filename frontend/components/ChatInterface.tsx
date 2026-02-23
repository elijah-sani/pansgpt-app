import React, { useRef, useEffect, useState } from 'react';
import {
    Clock,
    SquarePen,
    RotateCw,
    Plus,
    Mic,
    Send,
    X,
    MessageSquare,
    Trash2,
    AlertCircle,
    Loader2,
    Square,
    Pencil
} from 'lucide-react';

interface Message {
    role: 'system' | 'user' | 'assistant' | 'ai';
    content: string;
    id?: string;
    session_id?: string;
    imageBase64?: string;
    image_data?: string; // Backend field
    images?: string[]; // New Multi-image support
    isThinking?: boolean;
} // Kept for backward compat in message history, but we might want array here too later

import { ChatSession } from '../hooks/useChatHistory';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { InlineWaveform } from './InlineWaveform';
import MessageBubble from './MessageBubble';
import ReportProblemModal from './ReportProblemModal';
import ChatSessionItem from './ChatSessionItem';

interface ChatInterfaceProps {
    messages: Message[];
    isLoading: boolean;
    inputMessage: string;
    setInputMessage: (msg: string) => void;
    onSendMessage: () => void;
    pendingAttachments: string[];
    setPendingAttachments: React.Dispatch<React.SetStateAction<string[]>>;
    isMobile?: boolean; // To adjust layout if needed
    onCloseSidebar?: () => void; // For mobile/desktop close behavior
    onNewChat?: () => void; // Optional handler

    // Premium UX Props
    isError?: boolean;
    chatError?: string | null;
    onRetry?: () => void;
    onStopGeneration?: () => void;
    onEditMessage?: (messageId: string, newText: string) => void;

    // History Props
    sessions: ChatSession[];
    isLoadingHistory: boolean;
    onLoadSession: (id: string) => void;
    onClearHistory: () => void;
    onDeleteSession?: (id: string) => void;
    deletingId?: string | null;
    contextId?: string;
    onRegenerate?: () => void;
    activeStreamingAssistantId?: string | null;
    typingSpanRef?: React.RefObject<HTMLSpanElement | null>;
}

// Helper to safely parse image_data (JSON or raw string)
const getImages = (imgData: string | undefined): string[] => {
    if (!imgData) return [];
    try {
        // Try to parse it as a JSON array
        // We check start/end characters to avoid parsing plain base64 strings that might look like JSON (unlikely but safe)
        if (imgData.trim().startsWith('[') && imgData.trim().endsWith(']')) {
            const parsed = JSON.parse(imgData);
            if (Array.isArray(parsed)) return parsed;
        }
        return [imgData]; // Fallback: It was just a single string
    } catch {
        return [imgData]; // Fallback on error
    }
};

export default function ChatInterface({
    messages,
    isLoading,
    inputMessage,
    setInputMessage,
    onSendMessage,
    pendingAttachments,
    setPendingAttachments,
    isMobile = false,
    onNewChat,
    isError,
    chatError,
    onRetry,
    onStopGeneration,
    onEditMessage,
    sessions,
    isLoadingHistory,
    onLoadSession,
    onDeleteSession,
    deletingId,
    onRegenerate,
    activeStreamingAssistantId,
    typingSpanRef
}: ChatInterfaceProps) {
    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputMessageRef = useRef(inputMessage);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Delete Confirmation State
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Report Problem Modal State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);

    // Inline Editing State
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState("");
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
    const voiceBaseInputRef = useRef('');

    // State for Interactivity
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    // Auto-scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    useEffect(() => {
        inputMessageRef.current = inputMessage;
    }, [inputMessage]);

    useEffect(() => {
        if (!transcript && !interimTranscript) return;
        const base = voiceBaseInputRef.current;
        const spoken = `${transcript}${interimTranscript}`.trimStart();
        const spacer = base.trim().length > 0 && spoken.length > 0 ? ' ' : '';
        setInputMessage(`${base}${spacer}${spoken}`.trimStart());
    }, [transcript, interimTranscript, setInputMessage]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            const validFiles = files.filter(file => file.type.startsWith('image/'));

            if (validFiles.length + pendingAttachments.length > 5) { // Increased limit to 5
                alert("You can only attach up to 5 images.");
                return;
            }

            validFiles.forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64String = reader.result as string;
                    // Remove prefix
                    const base64Data = base64String.split(',')[1];
                    setPendingAttachments((prev: string[]) => [...prev, base64Data]);
                };
                reader.readAsDataURL(file);
            });
        }
        // Reset input
        e.target.value = '';
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault(); // Prevent pasting the file name
                const file = items[i].getAsFile();
                if (file) {
                    if (pendingAttachments.length >= 5) {
                        alert("You can only attach up to 5 images.");
                        return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64String = reader.result as string;
                        const base64Data = base64String.split(',')[1];
                        setPendingAttachments(prev => [...prev, base64Data]);
                    };
                    reader.readAsDataURL(file);
                }
            }
        }
    };

    const handleNewChatClick = () => {
        setIsHistoryOpen(false);
        if (onNewChat) onNewChat();
    };

    const handleVoiceToggleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (isProcessing || isStarting) return;
        if (isListening) {
            stopListening();
            return;
        }
        voiceBaseInputRef.current = inputMessageRef.current;
        resetTranscript();
        void startListening();
    };

    return (
        <div className="flex flex-col h-full w-full bg-background font-sans text-foreground relative">

            {/* 1. HEADER: Fixed Top Bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
                <div className="flex items-center gap-1">
                    {/* History Button (Opens Drawer) */}
                    <button
                        onClick={() => setIsHistoryOpen(true)}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                        title="History"
                    >
                        <Clock className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex items-center gap-1">
                    {/* New Chat Button */}
                    <button
                        onClick={handleNewChatClick}
                        className="hidden md:inline-flex p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                        title="New Chat"
                    >
                        <SquarePen className="w-5 h-5" />
                    </button>

                    {/* Mobile New Chat Button */}
                    {isMobile && (
                        <button
                            onClick={handleNewChatClick}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors md:hidden"
                            title="New Chat"
                        >
                            <SquarePen className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* 2. MESSAGE AREA: Scrollable */}
            <div className="flex-1 overflow-y-auto py-6 scroll-smooth">
                <div className="px-4 space-y-8 h-full flex flex-col">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground opacity-50 p-8">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                <SquarePen className="w-8 h-8" />
                            </div>
                            <p className="text-lg font-medium">Start a new conversation</p>
                        </div>
                    ) : (
                        messages.filter(m => m.role !== 'system').map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.role === 'system' ? 'items-center' : msg.role === 'user' ? 'items-end mb-[5px]' : 'items-start'} max-w-3xl mx-auto w-full group`}>

                                {/* User Message Area */}
                                {msg.role === 'user' ? (
                                    <>
                                        {/* 1. Image Grid (Multi-Image Support) */}
                                        {(() => {
                                            // 1. Get images from image_data (backend)
                                            const backendImages = getImages(msg.image_data);

                                            // 2. Combine with legacy/state images
                                            const allImages = [...(msg.images || []), ...backendImages];

                                            // 3. Add legacy imageBase64 if not already present
                                            if (msg.imageBase64 && !allImages.includes(msg.imageBase64)) {
                                                allImages.push(msg.imageBase64);
                                            }

                                            // 4. Deduplicate
                                            const uniqueImages = Array.from(new Set(allImages));

                                            if (uniqueImages.length > 0) {
                                                return (
                                                    <div className="flex flex-wrap gap-2 mb-2 justify-end">
                                                        {uniqueImages.map((img, idx) => (
                                                            <div
                                                                key={idx}
                                                                onClick={() => setSelectedImage(img)}
                                                                className="relative group cursor-zoom-in"
                                                            >
                                                                <img
                                                                    src={`data:image/jpeg;base64,${img}`}
                                                                    alt={`Attachment ${idx + 1}`}
                                                                    className="w-20 h-20 object-cover rounded-md border border-border shadow-sm hover:opacity-90 transition-opacity bg-black/5"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}

                                        {/* 2. Text Bubble or Inline Edit */}
                                        {msg.content && (
                                            editingMessageId === String(i) ? (
                                                /* Inline Edit Mode */
                                                <div className="max-w-[85%] w-full flex flex-col gap-2">
                                                    <textarea
                                                        value={editDraft}
                                                        onChange={(e) => setEditDraft(e.target.value)}
                                                        className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-[15px] leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none min-h-[80px]"
                                                        autoFocus
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingMessageId(null);
                                                                setEditDraft("");
                                                            }}
                                                            className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (onEditMessage && editDraft.trim()) {
                                                                    onEditMessage(msg.id ? String(msg.id) : String(i), editDraft.trim());
                                                                    setEditingMessageId(null);
                                                                    setEditDraft("");
                                                                }
                                                            }}
                                                            disabled={!editDraft.trim()}
                                                            className="px-3 py-1.5 text-sm bg-[#466b3c] text-white rounded-lg hover:bg-[#3a5630] disabled:opacity-50 transition-colors"
                                                        >
                                                            Save & Send
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Normal Display Mode */
                                                <>
                                                    <div className="max-w-[85%] bg-primary/15 text-foreground dark:bg-[#253920] dark:text-white px-5 py-3 rounded-2xl rounded-tr-sm shadow-sm border border-primary/20 dark:border-[#253920] text-[15px] leading-relaxed">
                                                        {msg.content}
                                                    </div>
                                                    {/* Edit Button (below bubble) */}
                                                    {onEditMessage && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingMessageId(String(i));
                                                                setEditDraft(msg.content);
                                                            }}
                                                            className="mt-1 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                                            title="Edit message"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </>
                                            )
                                        )}
                                    </>
                                ) : msg.role === 'system' ? (
                                    /* System Message (e.g. "Generation stopped by user") */
                                    <div className="text-sm text-muted-foreground italic px-4 py-2">
                                        {msg.content}
                                    </div>
                                ) : (
                                    /* AI Message (Markdown, No Background) */
                                    <MessageBubble
                                        message={msg}
                                        isThinking={Boolean(msg.isThinking)}
                                        useDirectTypingSpan={String(msg.id) === activeStreamingAssistantId}
                                        typingSpanRef={String(msg.id) === activeStreamingAssistantId ? typingSpanRef : undefined}
                                        onRegenerate={
                                            // Only pass regenerate handler if it's the last message and it's from assistant
                                            (i === messages.length - 1 && onRegenerate) ? onRegenerate : undefined
                                        }
                                    />
                                )}
                            </div>
                        ))
                    )}

                    {/* Error & Retry Block */}
                    {isError && !isLoading && (
                        <div className="max-w-3xl mx-auto w-full px-2">
                            <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-sm">
                                <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                                <span className="text-destructive font-medium flex-1">{chatError || "Network Error: Please try again."}</span>
                                {onRetry && (
                                    <button
                                        type="button"
                                        onClick={onRetry}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors shrink-0"
                                    >
                                        <RotateCw className="w-3.5 h-3.5" />
                                        Retry
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <div ref={chatEndRef} className="h-4" />
                </div>
            </div>

            {/* 3. INPUT AREA: Floating Capsule */}
            <div className="p-4 bg-background">
                <div className="max-w-3xl mx-auto relative">

                    {/* Attachments Preview (Scrollable Row) */}
                    {pendingAttachments.length > 0 && (
                        <div className="absolute -top-24 left-0 right-0 z-20 flex gap-2 overflow-x-auto px-4 py-2 animate-in fade-in slide-in-from-bottom-2 no-scrollbar">
                            {pendingAttachments.map((att, idx) => (
                                <div key={idx} className="relative group flex-shrink-0">
                                    <img
                                        src={`data:image/png;base64,${att}`}
                                        alt={`Attachment ${idx + 1}`}
                                        className="h-20 w-20 object-cover rounded-xl border border-border shadow-lg bg-background"
                                    />
                                    <button
                                        onClick={() => {
                                            const newAtts = [...pendingAttachments];
                                            newAtts.splice(idx, 1);
                                            setPendingAttachments(newAtts);
                                        }}
                                        className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-white rounded-full flex items-center justify-center shadow-md hover:bg-destructive/90 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* The Capsule */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (isListening) {
                                stopListening();
                                return;
                            }
                            onSendMessage();
                        }}
                        className={`flex items-center gap-2 p-2 bg-background border border-input rounded-full shadow-xl hover:shadow-2xl hover:border-primary/20 transition-all duration-300 ring-offset-background focus-within:ring-2 focus-within:ring-primary/20 ${isListening ? 'ring-2 ring-primary/20' : ''}`}
                    >

                        {/* Plus Button (Upload) - Hidden when listening/processing */}
                        {!isListening && !isProcessing && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-3 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors shrink-0"
                                    title="Add Attachment"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                                {/* Hidden File Input */}
                                <input
                                    type="file"
                                    multiple
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*" // Restrict to images
                                    onChange={handleFileUpload}
                                />
                            </>
                        )}

                        {/* Middle Area: Input or Waveform or Status */}
                        <div className="flex-1 min-w-0 flex items-center justify-center h-10">
                            {isListening ? (
                                <div className="w-full flex items-center justify-center px-4 animate-in fade-in zoom-in duration-300">
                                    <InlineWaveform volume={volume} />
                                </div>
                            ) : isProcessing ? (
                                <div className="flex items-center gap-2 px-2 text-muted-foreground animate-pulse">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span className="text-sm font-medium">Transcribing...</span>
                                </div>
                            ) : (
                                <input
                                    type="text"
                                    value={inputMessage}
                                    onChange={(e) => setInputMessage(e.target.value)}
                                    onPaste={handlePaste}
                                    // onKeyDown removed - form submit handles Enter key now
                                    placeholder={pendingAttachments.length > 0 ? "Ask about these images..." : "Ask a question..."}
                                    className="w-full bg-transparent border-none outline-none text-base placeholder:text-muted-foreground px-2"
                                    autoFocus
                                />
                            )}
                        </div>

                        {/* Right Tools - Dynamic Mic/Send/Stop */}
                        <div className="flex items-center gap-1 pr-1">
                            {isLoading ? (
                                /* Stop Generation Button - Regular App Color (Primary) */
                                <button
                                    type="button"
                                    onClick={onStopGeneration}
                                    className="p-2.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-all shadow-md flex items-center justify-center aspect-square animate-in zoom-in duration-200"
                                    title="Stop generation"
                                >
                                    <Square className="w-4 h-4 fill-current" />
                                </button>
                            ) : isProcessing ? (
                                /* Hidden or Disabled during processing */
                                <div className="w-10 h-10" />
                            ) : isListening ? (
                                /* Stop Recording Button - Regular App Color (Primary) */
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={handleVoiceToggleClick}
                                        disabled={isStarting || isProcessing}
                                        className={`p-2.5 bg-primary text-primary-foreground rounded-full transition-all shadow-md flex items-center justify-center aspect-square animate-in zoom-in duration-200 ${(isStarting || isProcessing) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/90'}`}
                                        title="Stop recording"
                                    >
                                        <Square className="w-4 h-4 fill-current" />
                                    </button>
                                </div>
                            ) : (!inputMessage.trim() && pendingAttachments.length === 0) ? (
                                /* Mic Button */
                                <button
                                    type="button"
                                    onClick={handleVoiceToggleClick}
                                    disabled={isStarting || isProcessing}
                                    className={`p-2.5 rounded-full transition-colors text-muted-foreground ${(isStarting || isProcessing) ? 'opacity-50 cursor-not-allowed' : 'hover:text-foreground hover:bg-muted'}`}
                                    title="Start voice input"
                                >
                                    <Mic className="w-5 h-5" />
                                </button>
                            ) : (
                                /* Send Button */
                                <button
                                    type="submit"
                                    className="p-2.5 bg-[#466b3c] text-white rounded-full hover:bg-[#3a5630] transition-all shadow-md flex items-center justify-center aspect-square"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </form>

                    <div className="text-center mt-3 text-xs text-muted-foreground">
                        AI can make mistakes. Verify important information.
                    </div>
                </div>
            </div>

            {/* --- HISTORY DRAWER --- */}
            {isHistoryOpen && (
                <>
                    {/* Backdrop (Absolute to ChatInterface) */}
                    <div
                        className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
                        onClick={() => setIsHistoryOpen(false)}
                    />

                    {/* Drawer Panel (Absolute to ChatInterface) */}
                    <div className="absolute inset-y-0 left-0 w-80 bg-background shadow-2xl z-50 transform transition-transform duration-300 flex flex-col border-r border-border animate-in slide-in-from-left">
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <h2 className="font-semibold text-lg">Recent Chats</h2>
                            <button
                                onClick={() => setIsHistoryOpen(false)}
                                className="p-2 hover:bg-muted rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {/* Simple List for now (Sorted by backend) */}
                            <div>
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Chats</h3>
                                <div className="space-y-1">
                                    {isLoadingHistory ? (
                                        <div className="text-sm text-muted-foreground p-2">Loading...</div>
                                    ) : sessions.length === 0 ? (
                                        <div className="text-sm text-muted-foreground p-2 italic">No history yet.</div>
                                    ) : (
                                        sessions.map(chat => (
                                            <ChatSessionItem
                                                key={chat.id}
                                                chat={chat}
                                                onLoadSession={onLoadSession}
                                                setIsHistoryOpen={setIsHistoryOpen}
                                                onDeleteClick={onDeleteSession ? () => {
                                                    setDeleteTargetId(chat.id);
                                                    setIsDeleteModalOpen(true);
                                                } : undefined}
                                                isDeleting={deletingId === chat.id}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions (Only Report for now) */}
                        <div className="p-4 border-t border-border bg-muted/20 space-y-2">
                            <button
                                onClick={() => setIsReportModalOpen(true)}
                                className="flex items-center gap-3 w-full p-2 hover:bg-muted rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <AlertCircle className="w-4 h-4" />
                                Report a Problem
                            </button>
                            {/* Clear All Button Removed per request */}
                        </div>
                    </div>
                </>
            )}
            {/* Lightbox Modal */}
            {selectedImage && (
                <div
                    className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 backdrop-blur-sm"
                    onClick={() => setSelectedImage(null)}
                >
                    <button
                        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors bg-black/50 rounded-full p-2"
                        onClick={() => setSelectedImage(null)}
                    >
                        <X className="w-6 h-6" />
                    </button>
                    <img
                        src={`data:image/jpeg;base64,${selectedImage}`}
                        alt="Full View"
                        className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div
                        className="bg-card text-card-foreground rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4 border border-border"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold mb-2">Delete Conversation?</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                            This action cannot be undone. All messages in this chat will be permanently removed.
                        </p>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setIsDeleteModalOpen(false);
                                    setDeleteTargetId(null);
                                }}
                                className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (deleteTargetId && onDeleteSession) {
                                        onDeleteSession(deleteTargetId);
                                        setIsDeleteModalOpen(false);
                                        setDeleteTargetId(null);
                                    }
                                }}
                                className="px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg text-sm font-medium transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Report Problem Modal */}
            <ReportProblemModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
            />
        </div>
    );
}
