import React, { Suspense } from 'react';
import QuizTaking from '@/components/QuizTaking';

interface QuizPageProps {
    params: Promise<{
        id: string;
    }>;
}

function QuizPageClient({ id }: { id: string }) {
    return <QuizTaking quizId={id} />;
}

export default async function QuizPage({ params }: QuizPageProps) {
    const { id } = await params;
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading quiz interface...</div>}>
            <QuizPageClient id={id} />
        </Suspense>
    );
}
