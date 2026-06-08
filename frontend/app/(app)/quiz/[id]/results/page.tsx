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
        <div className="h-full overflow-y-auto bg-background text-foreground">
            {/* Mobile header — same style as quiz creation page */}
            <QuizResultsHeader />

            <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
                <Suspense fallback={<div>Loading results...</div>}>
                    <QuizResults quizId={id} />
                </Suspense>
            </div>
        </div>
    );
}



