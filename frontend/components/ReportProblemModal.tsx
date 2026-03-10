'use client';
import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Loader2, Check } from 'lucide-react';
import MobileBottomSheet from '@/components/MobileBottomSheet';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

interface ReportProblemModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CATEGORIES = [
    'Bug / Glitch',
    'Feature Request',
    'Account Issue',
    'Other'
];

export default function ReportProblemModal({ isOpen, onClose }: ReportProblemModalProps) {
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showToast, setShowToast] = useState(false);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setSelectedCategory('');
            setDescription('');
            setIsSubmitting(false);
            setShowToast(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;
    const modalContent = (
        <>
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-2 text-foreground">
                    <AlertCircle className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">Report a Problem</h3>
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
                        What type of issue is this?
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map(category => (
                            <button
                                key={category}
                                onClick={() => setSelectedCategory(category)}
                                className={`rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${selectedCategory === category
                                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                    : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:bg-muted'
                                    }`}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-medium text-muted-foreground block">
                        Describe the issue...
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Please provide details so we can fix it..."
                        className="h-32 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/30 px-6 py-4">
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
                        ? 'cursor-not-allowed bg-primary/50 text-primary-foreground/60'
                        : 'bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg'
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
                            Submit Report
                        </>
                    )}
                </button>
            </div>

            {showToast && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-none">
                    <div className="min-w-[300px] rounded-lg border border-border bg-card px-6 py-3 text-center text-sm font-medium text-foreground shadow-lg">
                        Report submitted. Thank you for your feedback!
                    </div>
                </div>
            )}
        </>
    );

    async function handleSubmit() {
        if (!selectedCategory) return;

        setIsSubmitting(true);
        try {
            // 1. Await the current session/user from the shared browser client
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            const userId = session?.user?.id;

            if (sessionError) {
                console.error("Auth Error:", sessionError);
            }

            if (!userId) {
                console.error("Report Error - Missing User ID");
                return;
            }

            const response = await api.post('/feedback', {
                rating: 'report',
                category: selectedCategory,
                comments: description,
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to submit report');
            }
            console.log("Report submitted successfully!");

            // Show Success Toast
            setShowToast(true);
            setTimeout(() => {
                setShowToast(false);
                onClose(); // Close modal after toast
            }, 3000);

        } catch (error) {
            console.error("Report submit error:", error);
            // Optionally show error state here
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <>
            <MobileBottomSheet isOpen={isOpen} onClose={onClose}>
                <div className="relative flex max-h-[90vh] flex-col bg-card">
                    {modalContent}
                </div>
            </MobileBottomSheet>

            <div className="hidden md:block">
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div
                        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-xl animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {modalContent}
                    </div>
                </div>
            </div>
        </>
    );
}
