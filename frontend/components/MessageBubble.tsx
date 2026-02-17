'use client';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { ThumbsUp, ThumbsDown, Copy, Check, RotateCcw } from 'lucide-react';
import FeedbackModal from './FeedbackModal';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';

export interface Message {
    role: 'system' | 'user' | 'assistant' | 'ai';
    content: string;
    id?: string;
    session_id?: string;
    imageBase64?: string;
    image_data?: string;
    images?: string[];
}

interface MessageBubbleProps {
    message: Message;
    onRegenerate?: () => void;
}

export default function MessageBubble({ message, onRegenerate }: MessageBubbleProps) {
    const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
    const [copied, setCopied] = useState(false);

    const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
    const [currentRating, setCurrentRating] = useState<'up' | 'down'>('up');
    const [showToast, setShowToast] = useState(false);

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
        // 1. Initialize Supabase client
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // 2. Await the current session/user
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        if (sessionError) {
            console.error("Auth Error:", sessionError);
        }

        // 3. The Guard Clause
        if (!userId || !message.id || !message.session_id) {
            console.error("Feedback Error - Missing Data:", {
                userId: userId,
                messageId: message.id,
                sessionId: message.session_id
            });
            return;
        }

        try {
            // Optimistic update
            setFeedback(currentRating);

            // 4. Proceed with insert using the fetched userId
            const { error } = await supabase.from('message_feedback').insert({
                message_id: message.id,
                session_id: message.session_id,
                user_id: userId,
                rating: currentRating,
                category: category,
                comments: text
            });

            if (error) throw error;
            console.log("Feedback submitted successfully!");

            // Show Success Toast
            setShowToast(true);
            setTimeout(() => setShowToast(false), 4000);

        } catch (err) {
            console.error("Failed to submit feedback:", err);
        }
    };

    return (
        <div className="w-full pl-2 pr-4 group relative">
            {/* Markdown Content */}
            <div className="prose prose-zinc dark:prose-invert max-w-none prose-p:leading-relaxed prose-li:marker:text-primary/70">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {message.content}
                </ReactMarkdown>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-2 mt-3 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
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

                {/* Regenerate Button */}
                {onRegenerate && (
                    <button
                        onClick={onRegenerate}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors"
                        title="Regenerate response"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                )}
            </div>

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
