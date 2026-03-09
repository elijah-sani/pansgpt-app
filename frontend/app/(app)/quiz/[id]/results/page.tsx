import React, { Suspense } from 'react';
import QuizResults from '@/components/QuizResults';
import QuizResultsHeader from '@/components/QuizResultsHeader';

interface QuizResultsPageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function QuizResultsPage({ params }: QuizResultsPageProps) {
    const { id } = await params;
    return (
        <div className="h-full overflow-y-auto text-gray-900 dark:text-white bg-gray-50 dark:[background-color:#0C120C]">
            {/* Mobile header — same style as quiz creation page */}
            <QuizResultsHeader />

            <div className="max-w-4xl mx-auto px-4 py-8">
                <Suspense fallback={<div>Loading results...</div>}>
                    <QuizResults quizId={id} />
                </Suspense>
            </div>
        </div>
    );
}
