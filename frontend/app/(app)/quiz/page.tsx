"use client";
import React from 'react';
import QuizSelectionForm from '@/components/QuizSelectionForm';
import { PanelLeft } from 'lucide-react';
import { useSidebarTrigger } from '@/app/(app)/layout';

export default function QuizPage() {
    const openSidebar = useSidebarTrigger();
    return (
        <div className="min-h-screen bg-gray-50 dark:text-white dark:[background-color:#0C120C]">
            {/* Mobile header with hamburger */}
            <div className="md:hidden flex items-center px-4 py-3 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-transparent sticky top-0 z-10">
                <button onClick={openSidebar} className="p-2 text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors mr-2">
                    <PanelLeft size={20} />
                </button>
                <span className="text-sm font-semibold">Quiz Platform</span>
            </div>
            {/* Header */}
            <div className="border-b bg-white dark:bg-transparent border-gray-200 dark:border-white/10">
                <div className="max-w-7xl mx-auto px-6 py-6">
                    <div className="flex justify-center">
                        <div className="text-center">
                            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Quiz Platform</h1>
                            <p className="mt-2 text-lg text-gray-600 dark:text-white/80">
                                Test your knowledge with AI-generated quizzes
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8">
                <QuizSelectionForm />
            </div>
        </div>
    );
}
