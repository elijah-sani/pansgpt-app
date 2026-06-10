'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { useChatSession } from '@/lib/ChatSessionContext';
import { ArrowLeft, Award, CheckCircle2, Clock3, FileText, RotateCcw, Share2, X, XCircle } from 'lucide-react';
import QuizShareCard from './QuizShareCard';

interface QuestionResult {
  questionId: string;
  questionText: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  optionDetails?: Array<{ option: string; isCorrect: boolean; userSelected: boolean; score: number }>;
  partiallyCorrect?: boolean;
  explanation: string;
  points: number;
  earnedPoints: number;
}

interface QuizResult {
  id: string;
  score: number;
  max_score: number;
  percentage: number;
  time_taken?: number;
  completed_at: string;
  feedback: QuestionResult[];
  quiz?: {
    id: string;
    title: string;
    course_code: string;
    course_title: string;
    topic?: string;
    level: string;
    difficulty: string;
    num_questions: number;
  };
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAnswer(answer?: string) {
  if (!answer) return 'No answer provided';

  try {
    const parsed = JSON.parse(answer);
    if (Array.isArray(parsed)) return parsed.join(', ');
  } catch {
    // Plain text answers are expected for non-MCQ questions.
  }

  return answer;
}

function getScoreColor(percentage: number) {
  if (percentage >= 80) return 'text-primary';
  if (percentage >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600';
}

function getScoreMessage(percentage: number) {
  if (percentage >= 90) return 'Excellent performance';
  if (percentage >= 80) return 'Strong result';
  if (percentage >= 70) return 'Good progress';
  if (percentage >= 60) return 'Room to improve';
  return 'Review the weak areas';
}

export default function QuizResults({ quizId }: { quizId: string }) {
  void quizId;
  const router = useRouter();
  const { setPendingPath } = useChatSession();
  const searchParams = useSearchParams();
  const resultId = searchParams.get('resultId');

  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExplanations, setShowExplanations] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [shareCardClosing, setShareCardClosing] = useState(false);

  useEffect(() => {
    async function fetchResult() {
      try {
        if (!resultId) {
          throw new Error('Result ID not found');
        }

        const response = await api.get(`/api/quiz/results/${resultId}`);
        if (!response.ok) {
          throw new Error('Result not found');
        }

        const data = await response.json();
        setResult({ ...data.result, quiz: data.quiz });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load result');
      } finally {
        setLoading(false);
      }
    }

    void fetchResult();
  }, [resultId]);

  useEffect(() => {
    const toggleShareCard = () => {
      if (showShareCard) {
        closeShareCard();
      } else {
        setShowShareCard(true);
      }
    };

    window.addEventListener('quiz-results-toggle-share', toggleShareCard);
    return () => window.removeEventListener('quiz-results-toggle-share', toggleShareCard);
  }, [showShareCard]);

  const closeShareCard = () => {
    setShareCardClosing(true);
    window.setTimeout(() => {
      setShowShareCard(false);
      setShareCardClosing(false);
    }, 220);
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-5">
        <div className="max-w-sm text-center">
          <h2 className="text-xl font-semibold text-foreground">Unable to load result</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error || 'Result not found'}</p>
          <button
            onClick={() => { setPendingPath('/quiz'); router.push('/quiz'); }}
            className="mt-5 rounded-[5px] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to Quiz
          </button>
        </div>
      </div>
    );
  }

  const correctCount = result.feedback.filter((question) => question.isCorrect).length;
  const partialCount = result.feedback.filter((question) => question.partiallyCorrect).length;
  const incorrectCount = result.feedback.filter((question) => !question.isCorrect && !question.partiallyCorrect).length;
  const scoreColor = getScoreColor(result.percentage);

  return (
    <div className="text-foreground">
      <header className="hidden items-center justify-between border-b border-border/70 pb-5 md:flex">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {result.quiz?.course_code || 'Quiz'}
          </p>
          <h1 className="mt-2 truncate text-3xl font-bold tracking-tight text-foreground">Quiz Results</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {result.quiz?.title || 'Completed quiz'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={() => {
              if (showShareCard) {
                closeShareCard();
              } else {
                setShowShareCard(true);
              }
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-[5px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Share2 className="h-4 w-4" />
            {showShareCard ? 'Hide share card' : 'Share'}
          </button>
        </div>
      </header>

      <main className="mt-0 grid gap-4 md:mt-8 md:gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <section className="min-w-0 space-y-4 md:space-y-6">
          <button
            type="button"
            onClick={() => { setPendingPath('/quiz'); router.push('/quiz'); }}
            className="hidden items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80 md:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Quiz
          </button>

          <div className="rounded-[5px] bg-[#edf4ff] p-4 dark:bg-muted/60 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Final score</p>
                <div className={`mt-2 text-4xl font-bold tracking-tight md:mt-3 md:text-5xl ${scoreColor}`}>
                  {result.percentage.toFixed(1)}%
                </div>
                <p className={`mt-1.5 text-sm font-semibold md:mt-2 md:text-base ${scoreColor}`}>{getScoreMessage(result.percentage)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:min-w-72">
                <Metric label="Points" value={`${result.score}/${result.max_score}`} />
                <Metric label="Questions" value={`${correctCount}/${result.feedback.length}`} />
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-background/80 dark:bg-background/40 md:mt-6">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, result.percentage))}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <BreakdownCard label="Correct" value={correctCount} tone="primary" icon={<CheckCircle2 className="h-4 w-4" />} />
            <BreakdownCard label="Partial" value={partialCount} tone="amber" icon={<Award className="h-4 w-4" />} />
            <BreakdownCard label="Incorrect" value={incorrectCount} tone="red" icon={<XCircle className="h-4 w-4" />} />
          </div>

          <section className="space-y-3 md:space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground md:text-xl">Question Review</h2>
                <p className="mt-0.5 text-xs text-muted-foreground md:mt-1 md:text-sm">Check answers, corrections, and explanations.</p>
              </div>
              <button
                onClick={() => setShowExplanations((current) => !current)}
                className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-primary px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 md:min-h-10 md:px-4 md:text-sm"
              >
                {showExplanations ? 'Hide explanations' : 'Show explanations'}
              </button>
            </div>

            <div className="space-y-3">
              {result.feedback.map((question, index) => (
                <QuestionReviewCard
                  key={question.questionId}
                  index={index}
                  question={question}
                  showExplanation={showExplanations}
                />
              ))}
            </div>
          </section>
        </section>

        <aside className="space-y-5 lg:sticky lg:top-8">
          <div className="rounded-[5px] bg-[#edf4ff] p-5 dark:bg-muted/60">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Summary</p>
            <div className="mt-4 space-y-3">
              <SummaryRow icon={<FileText className="h-4 w-4" />} label="Course" value={result.quiz?.course_title || result.quiz?.course_code || 'Quiz'} />
              <SummaryRow icon={<Award className="h-4 w-4" />} label="Difficulty" value={result.quiz?.difficulty || 'Practice'} />
              {result.time_taken !== undefined && (
                <SummaryRow icon={<Clock3 className="h-4 w-4" />} label="Time" value={formatTime(result.time_taken)} />
              )}
              <SummaryRow icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={formatDate(result.completed_at)} />
            </div>
          </div>

          <button
            onClick={() => { setPendingPath('/quiz'); router.push('/quiz?new=1'); }}
            className="hidden min-h-11 w-full items-center justify-center gap-2 rounded-[5px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 lg:inline-flex"
          >
            <RotateCcw className="h-4 w-4" />
            Take another quiz
          </button>
        </aside>
      </main>

      {showShareCard && (
        <div className={`fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-200 md:items-center md:p-4 ${
          shareCardClosing ? 'opacity-0' : 'opacity-100'
        }`}>
          <div className={`relative h-[92vh] w-full overflow-hidden rounded-t-[24px] border-t border-border bg-background shadow-2xl transition-transform duration-300 ease-out md:h-[80vh] md:w-[80vw] md:max-w-6xl md:rounded-[8px] md:border md:border-border md:bg-card ${
            shareCardClosing ? 'translate-y-full md:translate-y-4 md:scale-[0.98]' : 'translate-y-0 md:translate-y-0 md:scale-100'
          }`}>
            <button
              type="button"
              onClick={closeShareCard}
              className="absolute right-3 top-3 z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-muted md:inline-flex"
              aria-label="Close share card"
            >
              <X className="h-4 w-4" />
            </button>
            <QuizShareCard
              result={{
                score: result.score,
                maxScore: result.max_score,
                percentage: result.percentage,
                timeTaken: result.time_taken,
                completedAt: result.completed_at,
                quiz: {
                  title: result.quiz?.title || 'Quiz',
                  courseCode: result.quiz?.course_code || '',
                  courseTitle: result.quiz?.course_title || '',
                  topic: result.quiz?.topic,
                },
              }}
              onClose={closeShareCard}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[5px] bg-background/80 p-2.5 dark:bg-background/40 md:p-3">
      <p className="text-[11px] text-muted-foreground md:text-xs">{label}</p>
      <p className="mt-0.5 text-base font-bold text-foreground md:mt-1 md:text-lg">{value}</p>
    </div>
  );
}

function BreakdownCard({ label, value, tone, icon }: { label: string; value: number; tone: 'primary' | 'amber' | 'red'; icon: React.ReactNode }) {
  const classes = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-400/15 dark:text-amber-300 dark:border-amber-400/30',
    red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  }[tone];

  return (
    <div className={`flex min-h-20 flex-col items-start justify-between rounded-[5px] border p-2.5 md:min-h-20 md:flex-row md:items-center md:p-4 ${classes}`}>
      <div className="flex items-center gap-1.5 md:gap-3">
        {icon}
        <span className="text-[11px] font-semibold md:text-sm">{label}</span>
      </div>
      <span className="text-xl font-bold leading-none md:text-2xl">{value}</span>
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[5px] bg-background/70 p-2.5 dark:bg-background/40 md:gap-3 md:p-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground md:text-xs">{label}</p>
        <p className="mt-0.5 break-words text-xs font-semibold text-foreground md:text-sm">{value}</p>
      </div>
    </div>
  );
}

function QuestionReviewCard({ question, index, showExplanation }: { question: QuestionResult; index: number; showExplanation: boolean }) {
  const status = question.isCorrect ? 'correct' : question.partiallyCorrect ? 'partial' : 'incorrect';
  const statusLabel = question.isCorrect ? 'Correct' : question.partiallyCorrect ? 'Partial' : 'Incorrect';
  const statusClasses = {
    correct: 'border-primary/30 bg-primary/10 text-primary',
    partial: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/15 dark:text-amber-300',
    incorrect: 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300',
  }[status];

  return (
    <article className="rounded-[5px] border border-border bg-card p-3.5 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:text-xs">Question {index + 1}</p>
          <h3 className="mt-1.5 text-sm font-semibold leading-6 text-foreground md:mt-2 md:text-base md:leading-7">{question.questionText}</h3>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold md:px-2.5 md:py-1 md:text-xs ${statusClasses}`}>
          {statusLabel}
        </span>
      </div>

      {Array.isArray(question.optionDetails) && question.optionDetails.length > 0 ? (
        <div className="mt-3 space-y-2 md:mt-4">
          {question.optionDetails.map((option, index) => (
            <div
              key={`${option.option}-${index}`}
              className={`rounded-[5px] border p-2.5 md:p-3 ${
                option.isCorrect
                  ? 'border-primary/30 bg-primary/10'
                  : option.userSelected
                    ? 'border-red-200 bg-red-50 dark:border-red-500/40 dark:bg-red-500/15'
                    : 'border-border bg-background/60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium text-foreground md:text-sm">{option.option}</p>
                <span className="shrink-0 text-[11px] font-semibold text-muted-foreground md:text-xs">{option.score > 0 ? `+${option.score}` : option.score}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground md:text-xs">
                {option.userSelected ? 'Selected' : 'Not selected'} - {option.isCorrect ? 'Correct option' : 'Incorrect option'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 md:mt-4 md:grid-cols-2">
          <AnswerBlock label="Your answer" value={formatAnswer(question.selectedAnswer)} tone={status} />
          {!question.isCorrect && <AnswerBlock label="Correct answer" value={formatAnswer(question.correctAnswer)} tone="correct" />}
        </div>
      )}

      {showExplanation && question.explanation && (
        <div className="mt-3 rounded-[5px] border border-primary/20 bg-primary/10 p-3 md:mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary md:text-xs">Explanation</p>
          <p className="mt-1.5 text-xs leading-5 text-foreground/90 md:mt-2 md:text-sm md:leading-6">{question.explanation}</p>
        </div>
      )}
    </article>
  );
}

function AnswerBlock({ label, value, tone }: { label: string; value: string; tone: 'correct' | 'partial' | 'incorrect' }) {
  const classes = {
    correct: 'border-primary/30 bg-primary/10',
    partial: 'border-amber-200 bg-amber-50 dark:border-amber-400/40 dark:bg-amber-400/15',
    incorrect: 'border-red-200 bg-red-50 dark:border-red-500/40 dark:bg-red-500/15',
  }[tone];

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:text-xs">{label}</p>
      <div className={`min-h-10 rounded-[5px] border p-2.5 text-xs text-foreground md:min-h-12 md:p-3 md:text-sm ${classes}`}>
        {value}
      </div>
    </div>
  );
}
