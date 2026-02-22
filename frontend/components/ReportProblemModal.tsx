'use client';
import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Loader2, Check } from 'lucide-react';
import { api } from '@/lib/api';

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

    const handleSubmit = async () => {
        if (!selectedCategory) return;

        setIsSubmitting(true);
        try {
            const res = await api.post('/feedback', {
                rating: 'report', // Flags it as a general issue
                category: selectedCategory,
                comments: description
                // message_id and session_id are intentionally null
            });

            if (!res.ok) {
                throw new Error(`Report API failed: ${res.status}`);
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
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="w-full max-w-md bg-[#1a1a1a]/90 border border-white/10 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden animate-in zoom-in-95 duration-200 relative"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-2 text-foreground/90">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                        <h3 className="font-semibold text-lg">Report a Problem</h3>
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

                    {/* Categories */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-muted-foreground block">
                            What type of issue is this?
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map(category => (
                                <button
                                    key={category}
                                    onClick={() => setSelectedCategory(category)}
                                    className={`px-3 py-1.5 text-sm rounded-full border transition-all duration-200 ${selectedCategory === category
                                        ? 'bg-amber-500/20 border-amber-500 text-amber-500 shadow-sm'
                                        : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:border-white/20'
                                        }`}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Text Area */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-muted-foreground block">
                            Describe the issue...
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Please provide details so we can fix it..."
                            className="w-full h-32 px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-sm resize-none placeholder:text-muted-foreground/50"
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
                            ? 'bg-amber-500/50 text-white/50 cursor-not-allowed'
                            : 'bg-amber-600 text-white hover:bg-amber-700 shadow-md hover:shadow-lg'
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

                {/* Success Toast Overlay (Inside Modal for simplicity, but fixed to screen) */}
                {showToast && (
                    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-none">
                        <div className="bg-[#e3e3e3] text-[#444746] px-6 py-3 rounded-lg shadow-sm text-sm font-medium min-w-[300px] text-center">
                            Report submitted. Thank you for your feedback!
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
