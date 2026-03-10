'use client';
import React, { useState, useEffect } from 'react';
import { X, ThumbsUp, ThumbsDown, Check, Loader2 } from 'lucide-react';
import MobileBottomSheet from '@/components/MobileBottomSheet';

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
    const accentClass = rating === 'up'
        ? 'text-primary bg-primary/10'
        : 'text-destructive bg-destructive/10';
    const selectedTagClass = rating === 'up'
        ? 'border-primary bg-primary/10 text-primary shadow-sm'
        : 'border-destructive bg-destructive/10 text-destructive shadow-sm';
    const activeButtonClass = rating === 'up'
        ? 'bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg'
        : 'bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 hover:shadow-lg';

    const modalContent = (
        <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-2 text-foreground">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${accentClass}`}>
                        {rating === 'up' ? (
                            <ThumbsUp className="h-4 w-4" />
                        ) : (
                            <ThumbsDown className="h-4 w-4" />
                        )}
                    </div>
                    <h3 className="font-semibold text-lg">Provide Feedback</h3>
                </div>
                <button
                    onClick={onClose}
                    className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="p-6 space-y-6">
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
                                    ? selectedTagClass
                                    : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted hover:border-primary/50'
                                    }`}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-medium text-muted-foreground block">
                        Additional Comments (Optional)
                    </label>
                    <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Tell us more..."
                        className="w-full h-24 px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-base md:text-sm resize-none placeholder:text-muted-foreground/50"
                    />
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
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
                        : activeButtonClass
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
        </>
    );

    async function handleSubmit() {
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
    }

    return (
        <>
            <MobileBottomSheet isOpen={isOpen} onClose={onClose}>
                <div className="bg-card flex flex-col max-h-[90vh]">
                    {modalContent}
                </div>
            </MobileBottomSheet>

            <div className="hidden md:block">
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div
                        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl backdrop-blur-md overflow-hidden animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {modalContent}
                    </div>
                </div>
            </div>
        </>
    );
}
