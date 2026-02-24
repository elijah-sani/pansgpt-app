'use client';
import React, { useState, useEffect } from 'react';
import { X, ThumbsUp, ThumbsDown, Check, Loader2 } from 'lucide-react';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    rating: 'up' | 'down';
    onSubmit: (category: string, text: string) => Promise<void>;
}

const UP_TAGS = [
    'Factually correct',
    'Easy to understand',
    'Great study aid',
    'Informative',
    'Other'
];

const DOWN_TAGS = [
    'Not factually correct',
    "Didn't follow instructions",
    'Irrelevant to Pharmacy',
    'Missing context',
    'Other'
];

export default function FeedbackModal({ isOpen, onClose, rating, onSubmit }: FeedbackModalProps) {
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [feedbackText, setFeedbackText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setSelectedCategory('');
            setFeedbackText('');
            setIsSubmitting(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const tags = rating === 'up' ? UP_TAGS : DOWN_TAGS;

    const handleSubmit = async () => {
        if (!selectedCategory) return;

        setIsSubmitting(true);
        try {
            await onSubmit(selectedCategory, feedbackText);
            onClose();
        } catch (error) {
            console.error("Feedback submit error:", error);
            // Optionally show error state here
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="w-full max-w-md bg-[#1a1a1a]/90 border border-white/10 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-2 text-foreground/90">
                        {rating === 'up' ? (
                            <ThumbsUp className="w-5 h-5 text-green-500 fill-green-500/20" />
                        ) : (
                            <ThumbsDown className="w-5 h-5 text-red-500 fill-red-500/20" />
                        )}
                        <h3 className="font-semibold text-lg">Provide Feedback</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-white/5 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">

                    {/* Tags */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-muted-foreground block">
                            What was {rating === 'up' ? 'good' : 'wrong'}?
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {tags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => setSelectedCategory(tag)}
                                    className={`px-3 py-1.5 text-sm rounded-full border transition-all duration-200 ${selectedCategory === tag
                                            ? 'bg-primary/20 border-primary text-primary shadow-sm'
                                            : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:border-white/20'
                                        }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Text Area */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-muted-foreground block">
                            Additional Comments (Optional)
                        </label>
                        <textarea
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            placeholder="Tell us more..."
                            className="w-full h-24 px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm resize-none placeholder:text-muted-foreground/50"
                        />
                    </div>

                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-white/5">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedCategory || isSubmitting}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${!selectedCategory || isSubmitting
                                ? 'bg-primary/50 text-primary-foreground/50 cursor-not-allowed'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg'
                            }`}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                Submit Feedback
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
