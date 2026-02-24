"use client";
import React from 'react';
import QuizSelectionForm from '@/components/QuizSelectionForm';
import { ThemeToggle } from '@/components/ThemeToggle';
import BackButton from '@/components/BackButton';

export default function QuizPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:text-white dark:[background-color:#0C120C]">
      {/* Header */}
      <div className="border-b bg-white dark:bg-transparent border-gray-200 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Navigation Row */}
          <div className="flex items-center justify-between mb-4">
            <BackButton href="/main" label="Back to Chat" />
            <a
              href="/quiz/history"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-[#00A400] border border-green-200 dark:border-green-600/30"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Quiz History
            </a>
          </div>
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