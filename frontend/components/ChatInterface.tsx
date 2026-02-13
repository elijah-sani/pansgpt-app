import React, { useRef, useEffect, useState } from 'react';
import {
    Clock,
    SquarePen,
    ThumbsUp,
    ThumbsDown,
    Copy,
    RotateCw,
    Plus,
    Mic,
    Send,
    X,
    MessageSquare,
    Trash2,
    AlertCircle,
    Loader2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    id?: string;
    session_id?: string;
    imageBase64?: string;
    image_data?: string; // Backend field
    images?: string[]; // New Multi-image support
} // Kept for backward compat in message history, but we might want array here too later

import { ChatSession } from '../hooks/useChatHistory';
import MessageBubble from './MessageBubble';
import ReportProblemModal from './ReportProblemModal';

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

    // History Props
    sessions: ChatSession[];
    isLoadingHistory: boolean;
    onLoadSession: (id: string) => void;
    onClearHistory: () => void;
    onDeleteSession?: (id: string) => void;
    deletingId?: string | null;
    contextId?: string;
    onRegenerate?: () => void;
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
    } catch (e) {
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
    onCloseSidebar,
    onNewChat,
    sessions,
    isLoadingHistory,
    onLoadSession,
    onClearHistory,
    onDeleteSession,
    deletingId,
    contextId,
    onRegenerate
}: ChatInterfaceProps) {
    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Delete Confirmation State
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Report Problem Modal State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);

    // State for Interactivity
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    // Auto-scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

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
                    // @ts-ignore
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

    return (
        <div className="flex flex-col h-full bg-background font-sans text-foreground border-l border-border relative">

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
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                        title="New Chat"
                    >
                        <SquarePen className="w-5 h-5" />
                    </button>

                    {/* Mobile Close Button (if applicable) */}
                    {isMobile && onCloseSidebar && (
                        <button
                            onClick={onCloseSidebar}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors md:hidden"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* 2. MESSAGE AREA: Scrollable */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 scroll-smooth">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground opacity-50 p-8">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                            <SquarePen className="w-8 h-8" />
                        </div>
                        <p className="text-lg font-medium">Start a new conversation</p>
                    </div>
                ) : (
                    messages.filter(m => m.role !== 'system').map((msg, i) => (
                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-3xl mx-auto w-full group`}>

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

                                    {/* 2. Text Bubble */}
                                    {msg.content && (
                                        <div className="max-w-[85%] bg-[#253920] text-white px-5 py-3 rounded-2xl rounded-tr-sm shadow-sm border border-[#253920] text-[15px] leading-relaxed">
                                            {msg.content}
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* AI Message (Markdown, No Background) */
                                <MessageBubble
                                    message={msg}
                                    onRegenerate={
                                        // Only pass regenerate handler if it's the last message and it's from assistant
                                        (i === messages.length - 1 && onRegenerate) ? onRegenerate : undefined
                                    }
                                />
                            )}
                        </div>
                    ))
                )}

                {/* Loading Indicator (Typing Bubble) */}
                {isLoading && (
                    <div className="max-w-3xl mx-auto w-full pl-2">
                        <div className="flex items-center gap-1 p-2 bg-transparent">
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} className="h-4" />
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
                    <div className="flex items-center gap-2 p-2 bg-background border border-input rounded-full shadow-xl hover:shadow-2xl hover:border-primary/20 transition-all duration-300 ring-offset-background focus-within:ring-2 focus-within:ring-primary/20">

                        {/* Plus Button (Upload) */}
                        <button
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

                        {/* Text Input */}
                        <input
                            type="text"
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            onPaste={handlePaste}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    onSendMessage();
                                }
                            }}
                            placeholder={pendingAttachments.length > 0 ? "Ask about these images..." : "Ask a question..."}
                            className="flex-1 bg-transparent border-none outline-none text-[15px] placeholder:text-muted-foreground px-2 h-10"
                        />

                        {/* Right Tools - Dynamic Mic/Send */}
                        <div className="flex items-center gap-1 pr-1">
                            {!inputMessage.trim() && pendingAttachments.length === 0 ? (
                                <button
                                    className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                                    title="Voice Input (Coming Soon)"
                                >
                                    <Mic className="w-5 h-5" />
                                </button>
                            ) : (
                                <button
                                    onClick={onSendMessage}
                                    disabled={isLoading}
                                    className="p-2.5 bg-[#466b3c] text-white rounded-full hover:bg-[#3a5630] disabled:opacity-50 transition-all shadow-md flex items-center justify-center aspect-square"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="text-center mt-3 text-xs text-muted-foreground">
                        AI can make mistakes. Verify important information.
                    </div>
                </div>
            </div>

            {/* --- HISTORY DRAWER --- */}
            {isHistoryOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
                        onClick={() => setIsHistoryOpen(false)}
                    />

                    {/* Drawer Panel */}
                    <div className="fixed inset-y-0 left-0 w-80 bg-background shadow-2xl z-50 transform transition-transform duration-300 flex flex-col border-r border-border animate-in slide-in-from-left">
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
                                        sessions.map(chat => {
                                            // Safe Date Formatting
                                            const date = new Date(chat.created_at);
                                            const isValidDate = !isNaN(date.getTime());

                                            return (
                                                <div
                                                    key={chat.id}
                                                    onClick={() => {
                                                        onLoadSession(chat.id);
                                                        setIsHistoryOpen(false);
                                                    }}
                                                    className="p-3 hover:bg-muted/50 rounded-lg cursor-pointer text-sm font-medium transition-colors flex items-center gap-2 group w-full justify-between"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <MessageSquare className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                                                        <span className="truncate flex-1 min-w-0 text-left">{chat.title}</span>
                                                    </div>

                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <span className="text-xs text-muted-foreground whitespace-nowrap hidden group-hover:block transition-opacity opacity-0 group-hover:opacity-100">
                                                            {isValidDate ? date.toLocaleDateString() : ''}
                                                        </span>
                                                        {onDeleteSession && (
                                                            deletingId === chat.id ? (
                                                                <div className="p-1">
                                                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setDeleteTargetId(chat.id);
                                                                        setIsDeleteModalOpen(true);
                                                                    }}
                                                                    className="text-gray-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    title="Delete Chat"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
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
