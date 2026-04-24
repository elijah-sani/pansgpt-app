"use client";
import React from 'react';
import QuizHistory from '@/components/QuizHistory';
import BackButton from '@/components/BackButton';

export default function QuizHistoryPage() {
    return (
        <div className="min-h-screen text-foreground py-8 bg-background">
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



