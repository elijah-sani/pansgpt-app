'use client';
import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { ThumbsUp, ThumbsDown, Copy, Check, RotateCcw, StopCircle, Quote, BookmarkPlus, Loader2 } from 'lucide-react';
import FeedbackModal from './FeedbackModal';
import { api } from '@/lib/api';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

export interface Message {
    role: 'system' | 'user' | 'assistant' | 'ai';
    content: string;
    id?: string;
    session_id?: string;
    imageBase64?: string;
    image_data?: string;
    images?: string[];
    citations?: Array<{ topic?: string; title?: string; course?: string; lecturer?: string }>;
    isThinking?: boolean;
    isStopped?: boolean;
    status?: string;
}

interface MessageBubbleProps {
    message: Message;
    onRegenerate?: () => void;
    isThinking?: boolean;
    isStreaming?: boolean;
    showCitationsButton?: boolean;
    onAddToNote?: (content: string) => Promise<void> | void;
}

export default function MessageBubble({
    message,
    onRegenerate,
    isThinking = false,
    isStreaming = false,
    showCitationsButton = true,
    onAddToNote,
}: MessageBubbleProps) {
    const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
    const [copied, setCopied] = useState(false);
    const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
    const [currentRating, setCurrentRating] = useState<'up' | 'down'>('up');
    const [showToast, setShowToast] = useState(false);
    const [displayedStatus, setDisplayedStatus] = useState('Processing...');
    const [isStatusVisible, setIsStatusVisible] = useState(true);
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [noteSaved, setNoteSaved] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);

    const statusLabel = useMemo(
        () =>
        ({
            reading_image: 'Reading image...',
            searching_web: 'Searching the web...',
            searching_curriculum: 'Searching curriculum...',
            retrieving_context: 'Retrieving relevant content...',
            thinking: 'Thinking...',
            preparing_response: 'Preparing response...',
        }[message.status ?? ''] ?? 'Thinking...'),
        [message.status]
    );

    useEffect(() => {
        if (!isThinking) {
            setDisplayedStatus(statusLabel);
            setIsStatusVisible(true);
            return;
        }

        if (displayedStatus === statusLabel) {
            setIsStatusVisible(true);
            return;
        }

        setIsStatusVisible(false);
        const timeoutId = window.setTimeout(() => {
            setDisplayedStatus(statusLabel);
            setIsStatusVisible(true);
        }, 180);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [displayedStatus, isThinking, statusLabel]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const handleFeedbackClick = (rating: 'up' | 'down') => {
        if (feedback === rating) {
            // Toggle off if already selected
            setFeedback(null);
            return;
        }
        // Open modal
        setCurrentRating(rating);
        setFeedbackModalOpen(true);
    };

    const handleFeedbackSubmit = async (category: string, text: string) => {
        if (!message.id || !message.session_id) {
            console.error("Feedback Error - Missing Data:", {
                messageId: message.id,
                sessionId: message.session_id
            });
            return;
        }
        const messageId = Number(message.id);
        if (!Number.isFinite(messageId)) {
            console.error("Feedback Error - Invalid message ID:", message.id);
            return;
        }

        try {
            // Optimistic update
            setFeedback(currentRating);

            const res = await api.post('/feedback', {
                message_id: messageId,
                session_id: message.session_id,
                rating: currentRating,
                category: category,
                comments: text
            });

            if (!res.ok) {
                throw new Error(`Feedback API failed: ${res.status}`);
            }
            console.log("Feedback submitted successfully!");

            // Show Success Toast
            setShowToast(true);
            setTimeout(() => setShowToast(false), 4000);

        } catch (err) {
            console.error("Failed to submit feedback:", err);
        }
    };

    const handleAddToNote = async () => {
        if (!onAddToNote || !message.content.trim() || isSavingNote) {
            return;
        }

        try {
            setIsSavingNote(true);
            await onAddToNote(message.content);
            setNoteSaved(true);
            window.setTimeout(() => setNoteSaved(false), 2000);
        } catch (err) {
            console.error("Failed to save note:", err);
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleRegenerateClick = async () => {
        if (!onRegenerate || isRegenerating) {
            return;
        }

        try {
            setIsRegenerating(true);
            await new Promise((resolve) => window.setTimeout(resolve, 150));
            await onRegenerate();
        } finally {
            setIsRegenerating(false);
        }
    };

    return (
        <div className={`w-full pr-4 group relative font-sans ${message.role === 'user' ? 'mb-[5px]' : ''}`}>
            <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-3 mb-1">
                    <div className="relative flex items-center justify-center w-10 h-10 shrink-0 -ml-1.5">
                        <div className="relative flex h-8 w-8 items-center justify-center">
                            {isThinking && (
                                <span className="absolute inset-0 w-full h-full rounded-full border-2 border-t-[#057400] border-r-[#1e811a] border-b-transparent border-l-transparent animate-spin animate-pulse" />
                            )}
                            <img
                                src="/avatar.png"
                                alt="PansGPT"
                                className={`z-10 object-contain transition-all duration-500 ease-out ${isThinking ? 'h-4 w-4' : 'h-5 w-5'}`}
                            />
                        </div>
                    </div>
                    {isThinking && (
                        <span
                            className={`text-sm text-muted-foreground transition-opacity duration-300 ${isStatusVisible ? 'opacity-100' : 'opacity-0'}`}
                        >
                            {displayedStatus}
                        </span>
                    )}
                </div>

                <div
                    className="w-full max-w-full break-words flex-1 prose dark:prose-invert prose-p:leading-relaxed prose-li:marker:text-primary/70 prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground"
                    style={{ fontFamily: "'Inter', sans-serif", fontSize: 'var(--chat-text-size, 15px)' }}
                >
                    <div className="overflow-x-auto w-full max-w-full break-words">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeRaw, rehypeKatex]}
                            components={{
                                table: ({ node, ...props }) => (
                                    <div className="my-0 w-full overflow-hidden overflow-x-auto rounded-xl border border-border shadow-sm 
      [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                                        <table
                                            className="w-full m-0 border-collapse text-sm text-left table-auto border-hidden"
                                            style={{ marginTop: 0, marginBottom: 0 }}
                                            {...props}
                                        />
                                    </div>
                                ),
                                thead: ({ node, ...props }) => (
                                    <thead className="bg-card text-foreground" {...props} />
                                ),
                                tbody: ({ node, ...props }) => (
                                    <tbody className="bg-muted/40" {...props} />
                                ),
                                th: ({ node, ...props }) => (
                                    <th className="px-4 py-5 border border-border/70 font-semibold whitespace-nowrap first:border-l-0 last:border-r-0 border-t-0" {...props} />
                                ),
                                td: ({ node, ...props }) => (
                                    <td className="px-4 py-2.5 border border-border/50 align-top first:border-l-0 last:border-r-0 last:border-b-0" {...props} />
                                ),
                                tr: ({ node, ...props }) => (
                                    <tr className="hover:bg-muted/30 transition-colors" {...props} />
                                ),
                                pre: ({ ...props }) => (
                                    <pre className="overflow-x-auto w-full max-w-full rounded-md" {...props} />
                                ),
                                a: ({ ...props }) => (
                                    <a className="break-all" {...props} />
                                ),
                            }}
                        >
                            {message.content}
                        </ReactMarkdown>
                    </div>
                    {message.isStopped && (
                        <div className="text-sm italic text-muted-foreground mt-2 flex items-center gap-2">
                            <StopCircle size={14} /> You stopped this response.
                        </div>
                    )}
                </div>
            </div>

            {/* Action Bar */}
            {!isThinking && (message.content.trim().length > 0 || message.isStopped) && (
                <div className="flex flex-row justify-start items-center gap-2 mt-3 text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
                    {/* Feedback Buttons */}
                    <button
                        onClick={() => handleFeedbackClick('up')}
                        className={`p-1.5 hover:bg-muted rounded-md transition-colors ${feedback === 'up' ? 'text-green-500 bg-green-500/10' : ''}`}
                        title="Helpful"
                    >
                        <ThumbsUp className="w-4 h-4" />
                    </button>

                    <button
                        onClick={() => handleFeedbackClick('down')}
                        className={`p-1.5 hover:bg-muted rounded-md transition-colors ${feedback === 'down' ? 'text-red-500 bg-red-500/10' : ''}`}
                        title="Not Helpful"
                    >
                        <ThumbsDown className="w-4 h-4" />
                    </button>

                    {/* Divider */}
                    <div className="w-px h-4 bg-border/50 mx-1" />

                    {/* Copy Button */}
                    <button
                        onClick={handleCopy}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors"
                        title="Copy message"
                    >
                        {copied ? (
                            <Check className="w-4 h-4 text-green-500" />
                        ) : (
                            <Copy className="w-4 h-4" />
                        )}
                    </button>

                    {onAddToNote && (
                        <button
                            onClick={() => void handleAddToNote()}
                            className="p-1.5 hover:bg-muted rounded-md transition-colors"
                            title="Add to notes"
                            disabled={isSavingNote}
                        >
                            {isSavingNote ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : noteSaved ? (
                                <Check className="w-4 h-4 text-green-500" />
                            ) : (
                                <BookmarkPlus className="w-4 h-4" />
                            )}
                        </button>
                    )}

                    {/* References Button */}
                    {showCitationsButton && Array.isArray(message.citations) && message.citations.length > 0 && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    className="p-1.5 hover:bg-muted rounded-md transition-colors"
                                    title="References"
                                    aria-label="References"
                                >
                                    <Quote className="w-4 h-4" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent
                                side="top"
                                align="start"
                                sideOffset={8}
                                className="w-72 p-3 bg-background border border-border/40 rounded-xl shadow-xl z-50"
                            >
                                {/* Header */}
                                <div className="mb-2 pb-2 border-b border-border/40">
                                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        References
                                    </h4>
                                </div>

                                {/* Scrollable List - Max height fits ~2 items before scrolling */}
                                <div className="flex flex-col gap-2.5 max-h-[90px] overflow-y-auto pr-2 
                                [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent 
                                [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">

                                    {message.citations.map((cite, idx) => (
                                        <div key={idx} className="flex flex-col">
                                            <span className="text-[13px] font-medium text-foreground leading-tight line-clamp-1">
                                                {cite.topic || cite.title}
                                            </span>
                                            {cite.lecturer && (
                                                <span className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                                                    {cite.lecturer}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}

                    {/* Regenerate Button */}
                    {onRegenerate && (
                        <button
                            onClick={() => void handleRegenerateClick()}
                            className="p-1.5 hover:bg-muted rounded-md transition-colors"
                            title="Regenerate response"
                            disabled={isRegenerating}
                        >
                            {isRegenerating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <RotateCcw className="w-4 h-4" />
                            )}
                        </button>
                    )}
                </div>
            )}

            {/* Feedback Modal */}
            <FeedbackModal
                isOpen={feedbackModalOpen}
                onClose={() => setFeedbackModalOpen(false)}
                rating={currentRating}
                onSubmit={handleFeedbackSubmit}
            />

            {/* Success Toast Overlay */}
            {showToast && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-none">
                    <div className="bg-[#e3e3e3] text-[#444746] px-6 py-3 rounded-lg shadow-sm text-sm font-medium min-w-[300px] text-center">
                        Thank you! Your feedback helps make PansGPT better for everyone.
                    </div>
                </div>
            )}
        </div>
    );
}
