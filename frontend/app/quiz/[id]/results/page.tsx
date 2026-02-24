import React, { Suspense } from 'react';
import QuizResults from '@/components/QuizResults';
import BackButton from '@/components/BackButton';

interface QuizResultsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function QuizResultsPage({ params }: QuizResultsPageProps) {
  const { id } = await params;
  return (
    <div className="min-h-screen text-gray-900 dark:text-white py-8 bg-gray-50 dark:[background-color:#0C120C]">
      <div className="max-w-4xl mx-auto px-4">
        {/* Back Button */}
        <div className="mb-6">
          <BackButton href="/quiz" label="Back to Quiz Creation" />
        </div>

        <Suspense fallback={<div>Loading results...</div>}>
          <QuizResults quizId={id} />
        </Suspense>
      </div>
    </div>
  );
} 