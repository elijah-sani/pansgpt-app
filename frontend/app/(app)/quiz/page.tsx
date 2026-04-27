"use client";
import React from 'react';
import QuizSelectionForm from '@/components/QuizSelectionForm';
import { PanelLeft } from 'lucide-react';
import { useSidebarTrigger } from '@/lib/sidebar-controls';

export default function QuizPage() {
    const openSidebar = useSidebarTrigger();
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Mobile header with hamburger */}
            <div className="md:hidden flex items-center px-4 py-3 border-b border-border bg-card/95 backdrop-blur-sm sticky top-0 z-10">
                <button onClick={openSidebar} className="p-2 text-foreground hover:bg-accent rounded-lg transition-colors mr-2">
                    <PanelLeft size={20} />
                </button>
                <span className="text-sm font-semibold">Quiz Platform</span>
            </div>
            <main className="relative mx-auto max-w-7xl px-6 py-12">
                {/* Header Section (matched to Reader Library style) */}
                <div className="mb-8">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                        <div>
                            <h2 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                                Quiz Platform
                            </h2>
                            <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
                                Test your knowledge with AI-generated quizzes
                            </p>
                        </div>
                        <div className="hidden md:block">
                            <div className="bg-secondary text-secondary-foreground px-4 py-2 rounded-full text-sm font-medium border border-border/50">
                                Smart Quiz Builder
                            </div>
                        </div>
                    </div>
                </div>

                <QuizSelectionForm />
            </main>
        </div>
    );
}



