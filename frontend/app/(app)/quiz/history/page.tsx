"use client";
import React from 'react';
import QuizHistory from '@/components/QuizHistory';
import BackButton from '@/components/BackButton';

export default function QuizHistoryPage() {
    return (
        <div className="min-h-screen text-gray-900 dark:text-white py-8 bg-gray-50 dark:[background-color:#0C120C]">
            <div className="max-w-4xl mx-auto px-4">
                {/* Back Button */}
                <div className="mb-6">
                    <BackButton href="/quiz" label="Back to Quiz Creation" />
                </div>

                <QuizHistory />
            </div>
        </div>
    );
}
