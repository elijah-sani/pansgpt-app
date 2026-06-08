import React, { Suspense } from 'react';
import QuizGeneratingScreen from '@/components/QuizGeneratingScreen';

interface QuizGeneratingPageProps {
  params: Promise<{
    jobId: string;
  }>;
}

export default async function QuizGeneratingPage({ params }: QuizGeneratingPageProps) {
  const { jobId } = await params;

  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Preparing quiz...</div>}>
      <QuizGeneratingScreen jobId={jobId} />
    </Suspense>
  );
}
