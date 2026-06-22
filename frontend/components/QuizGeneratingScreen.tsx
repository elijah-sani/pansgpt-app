'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Lightbulb, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { DID_YOU_KNOW_FACTS } from '@/lib/did-you-know-facts';
import type { DidYouKnowFact } from '@/lib/did-you-know-facts';

type QuizGenerationJob = {
  id: string;
  status: 'queued' | 'retrieving' | 'generating' | 'saving' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_step?: string;
  error_message?: string | null;
  quiz_id?: string | null;
  generated_question_count?: number;
  target_question_count?: number;
  request_payload?: {
    courseCode?: string;
    courseTitle?: string;
    topic?: string;
    numQuestions?: number;
  };
};

function getStructuredJobErrorMessage(errorMessage?: string | null) {
  if (!errorMessage) return null;
  try {
    const parsed = JSON.parse(errorMessage) as { message?: string };
    return parsed.message || errorMessage;
  } catch {
    return errorMessage;
  }
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-muted-foreground/20 ${className}`} />;
}

function shuffleFacts(facts: DidYouKnowFact[]) {
  const shuffled = [...facts];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
}

export default function QuizGeneratingScreen({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<QuizGenerationJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [factDeck, setFactDeck] = useState<DidYouKnowFact[]>(() => shuffleFacts(DID_YOU_KNOW_FACTS));
  const [factIndex, setFactIndex] = useState(0);
  const [isFactPopupDismissed, setIsFactPopupDismissed] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let jobTimeoutId: number | undefined;
    let navigated = false;

    const poll = async () => {
      try {
        const response = await api.get(`/api/quiz/jobs/${jobId}`);
        const rawText = await response.clone().text().catch(() => '');
        const data = rawText ? JSON.parse(rawText) : {};

        if (!response.ok) {
          throw new Error(data.detail || 'Unable to check quiz generation status.');
        }

        if (cancelled || !data.job) return;

        const nextJob = data.job as QuizGenerationJob;
        setJob(nextJob);
        setError(null);

        if (typeof window !== 'undefined') {
          if (nextJob.status === 'completed' || nextJob.status === 'failed' || nextJob.status === 'cancelled') {
            window.localStorage.removeItem('pansgpt-active-quiz-job-id');
          } else {
            window.localStorage.setItem('pansgpt-active-quiz-job-id', nextJob.id);
          }
        }

        // Redirect only when the job is fully completed.
        if (nextJob.status === 'completed' && nextJob.quiz_id && !navigated) {
          navigated = true;
          router.replace(`/quiz/${nextJob.quiz_id}`);
          return;
        }

        if (nextJob.status !== 'failed' && nextJob.status !== 'cancelled') {
          jobTimeoutId = window.setTimeout(poll, 1600);
        }
      } catch (err) {
        if (!cancelled) {
          if (typeof window !== 'undefined' && err instanceof Error && err.message.toLowerCase().includes('not found')) {
            window.localStorage.removeItem('pansgpt-active-quiz-job-id');
            router.replace('/quiz');
            return;
          }
          setError(err instanceof Error ? err.message : 'Unable to check quiz generation status.');
          jobTimeoutId = window.setTimeout(poll, 2500);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (jobTimeoutId) window.clearTimeout(jobTimeoutId);
    };
  }, [jobId, router]);

  useEffect(() => {
    if (DID_YOU_KNOW_FACTS.length <= 1 || isFactPopupDismissed) return;

    const intervalId = window.setInterval(() => {
      setFactIndex((current) => {
        const nextIndex = current + 1;
        if (nextIndex < factDeck.length) return nextIndex;

        setFactDeck((currentDeck) => {
          const previousFactId = currentDeck[currentDeck.length - 1]?.id;
          let nextDeck = shuffleFacts(DID_YOU_KNOW_FACTS);

          if (nextDeck.length > 1 && nextDeck[0]?.id === previousFactId) {
            nextDeck = [...nextDeck.slice(1), nextDeck[0]];
          }

          return nextDeck;
        });
        return 0;
      });
    }, 7000);

    return () => window.clearInterval(intervalId);
  }, [factDeck.length, isFactPopupDismissed]);

  const payload = job?.request_payload || {};
  const title = useMemo(() => {
    const topic = (payload.topic || '').trim();
    const courseTitle = (payload.courseTitle || '').trim();
    const courseCode = (payload.courseCode || '').trim();
    return `Quiz on ${topic || courseTitle || courseCode || 'your course'}`;
  }, [payload.courseCode, payload.courseTitle, payload.topic]);

  const progress = Math.max(4, Math.min(100, job?.progress || 8));
  const failed = job?.status === 'failed' || job?.status === 'cancelled';
  const readyQuestionCount = job?.generated_question_count || 0;
  const targetQuestionCount = job?.target_question_count || job?.request_payload?.numQuestions || 0;
  const statusText = failed
    ? getStructuredJobErrorMessage(job?.error_message) || 'Unable to generate this quiz.'
    : readyQuestionCount > 0
      ? `${readyQuestionCount}${targetQuestionCount > 0 ? ` of ${targetQuestionCount}` : ''} question${readyQuestionCount === 1 ? '' : 's'} generated. ${job?.current_step || 'Generating more questions...'}` 
      : job?.current_step || 'Generating practice exam...';
  const currentFact = factDeck[factIndex] || DID_YOU_KNOW_FACTS[0];
  const shouldShowFactPopup = Boolean(currentFact && !isFactPopupDismissed);

  const cancelGeneration = async () => {
    if (isCancelling) return;

    setIsCancelling(true);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('pansgpt-active-quiz-job-id');
    }

    try {
      await api.post(`/api/quiz/jobs/${jobId}/cancel`, {});
    } catch (err) {
      console.error('Failed to cancel quiz generation:', err);
    } finally {
      router.replace('/quiz');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex min-h-[3.75rem] items-center gap-3 border-b border-border bg-card/95 px-5 md:min-h-[4.5rem] md:px-8">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem('pansgpt-active-quiz-job-id');
            }
            router.replace('/quiz');
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
          aria-label="Back to quiz"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-7 w-px bg-border" />
        <h1 className="min-w-0 truncate text-base font-semibold md:text-xl">{title}</h1>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-6 md:px-8 md:py-8">
        <section className={`${failed ? 'border-red-500/30 bg-red-950/30' : 'border-primary/40 bg-primary/20'} rounded-2xl border px-6 py-8 shadow-sm md:p-8`}>
          <div className="flex flex-col items-center text-center">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${failed ? 'bg-red-500/15 text-red-300' : 'bg-primary/15 text-primary'}`}>
              {failed ? <AlertCircle className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
            </div>
            <h2 className="mt-4 text-lg font-bold text-white md:text-xl">
              {failed ? 'Quiz generation failed' : 'Generating practice exam...'}
            </h2>
            <p className="mt-2 text-xs text-white/70 md:text-sm">{statusText}</p>
            <div className="mt-5 h-2 w-full max-w-3xl overflow-hidden rounded-full bg-primary/20">
              <div className={`h-full rounded-full transition-all duration-500 ${failed ? 'bg-red-400' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex w-full max-w-3xl justify-between text-xs text-white/60">
              <span>{job?.status || 'queued'}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            {failed ? (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.localStorage.removeItem('pansgpt-active-quiz-job-id');
                  }
                  router.replace('/quiz?new=1');
                }}
                className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-white/90"
              >
                Try again
              </button>
            ) : (
              <button
                type="button"
                onClick={cancelGeneration}
                disabled={isCancelling}
                className="mt-5 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCancelling ? 'Cancelling...' : 'Cancel generation'}
              </button>
            )}
          </div>
        </section>

        <section className="mt-6 space-y-5">
          <div>
            <SkeletonLine className="h-6 w-32" />
            <div className="mt-7 flex gap-4 overflow-hidden">
              <SkeletonLine className="h-4 w-40 shrink-0" />
              <SkeletonLine className="h-4 w-64 shrink-0" />
              <SkeletonLine className="h-4 w-44 shrink-0" />
            </div>
            <SkeletonLine className="mt-3 h-4 w-3/4" />
          </div>

          <div className="space-y-3.5">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="flex min-h-14 items-center gap-4 rounded-xl border border-white/10 bg-transparent px-4 md:min-h-16 md:border-border">
                <div className="h-7 w-7 shrink-0 rounded-full border border-white/15 md:border-border" />
                <SkeletonLine className="h-5 w-1/2" />
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <p className="mt-5 text-center text-xs text-white/50 md:text-muted-foreground">{error}</p>
        ) : null}
      </main>

      <AnimatePresence>
        {shouldShowFactPopup ? (
          <motion.aside
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-xl rounded-2xl border border-amber-300/70 bg-amber-50 p-4 pr-12 text-amber-950 shadow-2xl shadow-black/25 md:bottom-6 md:right-6 md:left-auto md:mx-0 md:w-[min(28rem,calc(100vw-3rem))] dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-50"
            role="status"
            aria-live="polite"
          >
            <button
              type="button"
              onClick={() => setIsFactPopupDismissed(true)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-amber-800 transition-colors hover:bg-amber-200/70 hover:text-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
              aria-label="Dismiss did you know tip"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
                <Lightbulb className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">Did you know?</p>
                  <span className="rounded-full border border-amber-300/80 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-300/20 dark:text-amber-100">
                    {currentFact?.title}
                  </span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentFact?.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="mt-2 text-sm leading-6"
                  >
                    {currentFact?.fact}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
