'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options?: string[];
  question_order: number;
}

interface Quiz {
  id: string;
  title: string;
  course_code: string;
  course_title: string;
  topic?: string;
  level: string;
  difficulty: string;
  num_questions: number;
  time_limit?: number;
  questions: Question[];
}

interface UserAnswer {
  questionId: string;
  answer: string | string[];
}

function stripOptionLabel(text: string): string {
  return text.replace(/^\s*[\(\[]?[A-Ea-e1-5][\)\].:-]\s*/, '').trim();
}

function getQuestionStem(questionText: string, options?: string[]): string {
  const raw = (questionText || '').trim();
  if (!raw) return raw;

  let cutIndex = raw.length;
  const markerPatterns = [
    /\bselect\s+one\s+or\s+more\b/i,
    /\bselect\s+all\s+that\s+apply\b/i,
    /\b[a-e]\s*[.)]\s+/i,
  ];

  for (const pattern of markerPatterns) {
    const match = pattern.exec(raw);
    if (match && typeof match.index === 'number' && match.index > 0) {
      cutIndex = Math.min(cutIndex, match.index);
    }
  }

  if (Array.isArray(options)) {
    const questionLower = raw.toLowerCase();
    for (const option of options) {
      const optionCore = stripOptionLabel(String(option || ''));
      if (!optionCore) continue;
      const idx = questionLower.indexOf(optionCore.toLowerCase());
      if (idx > 0) {
        cutIndex = Math.min(cutIndex, idx);
      }
    }
  }

  return raw.slice(0, cutIndex).trim();
}

function isAnswered(answer: string | string[]) {
  if (Array.isArray(answer)) return answer.length > 0;
  return answer.trim().length > 0;
}

function formatDifficulty(value?: string) {
  if (!value) return 'Practice';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export default function QuizTaking({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showIncompleteSubmitDialog, setShowIncompleteSubmitDialog] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });
  }, []);

  useEffect(() => {
    async function fetchQuiz() {
      try {
        const response = await api.get(`/api/quiz/${quizId}`);
        if (!response.ok) {
          throw new Error('Quiz not found');
        }

        const data = await response.json();
        setQuiz(data.quiz);
        setUserAnswers(data.quiz.questions.map((question: Question) => ({
          questionId: question.id,
          answer: '',
        })));

        if (data.quiz.time_limit) {
          setTimeRemaining(data.quiz.time_limit * 60);
        }

        setStartTime(new Date());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Quiz not found');
      } finally {
        setLoading(false);
      }
    }

    if (quizId) void fetchQuiz();
  }, [quizId]);

  const handleAnswerChange = (questionId: string, answer: string | string[]) => {
    setUserAnswers((prev) =>
      prev.map((item) => item.questionId === questionId ? { ...item, answer } : item)
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = useCallback(async () => {
    if (!quiz || !startTime) return;

    setIsSubmitting(true);

    try {
      const timeTaken = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
      const response = await api.post('/api/quiz/submit', {
        quizId: quiz.id,
        userId: userId || '',
        answers: userAnswers.map((answer) => ({
          questionId: answer.questionId,
          selectedAnswer: Array.isArray(answer.answer) ? JSON.stringify(answer.answer) : answer.answer,
        })),
        timeTaken,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit quiz');
      }

      router.push(`/quiz/${quizId}/results?resultId=${data.result.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit quiz');
      setIsSubmitting(false);
    }
  }, [quiz, quizId, router, startTime, userAnswers, userId]);

  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev !== null && prev <= 1) {
          void handleSubmit();
          return 0;
        }
        return prev !== null ? prev - 1 : null;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [handleSubmit, timeRemaining]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="max-w-sm text-center">
          <h2 className="text-xl font-semibold text-foreground">Unable to open quiz</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error || 'Quiz not found'}</p>
          <button
            onClick={() => router.push('/quiz?new=1')}
            className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to Quiz
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const currentAnswer = userAnswers.find((answer) => answer.questionId === currentQuestion.id)?.answer || '';
  const currentQuestionStem = getQuestionStem(currentQuestion.question_text, currentQuestion.options);
  const currentAnswered = isAnswered(currentAnswer);
  const answeredCount = userAnswers.filter((answer) => isAnswered(answer.answer)).length;
  const progressPercentage = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;
  const isFinalQuestion = currentQuestionIndex === quiz.questions.length - 1;
  const goPrevious = () => setCurrentQuestionIndex((current) => Math.max(0, current - 1));
  const goNext = () => setCurrentQuestionIndex((current) => Math.min(quiz.questions.length - 1, current + 1));
  const optionClass = (selected: boolean) =>
    `flex min-h-[2.85rem] cursor-pointer items-center rounded-[5px] border px-3 py-1.5 text-[0.9rem] leading-snug transition-all md:min-h-[3.7rem] md:px-5 md:py-3 md:text-sm ${
      selected
        ? 'border-primary bg-primary/10 text-foreground shadow-sm'
        : 'border-border bg-card text-foreground hover:border-primary/30 hover:bg-accent'
    }`;
  const optionDotClass = (selected: boolean) =>
    `mr-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border md:h-5 md:w-5 ${
      selected
        ? 'border-primary bg-primary'
        : 'border-muted-foreground bg-transparent'
    }`;
  const mobileCanGoNext = !isFinalQuestion;
  const handleSubmitAttempt = () => {
    if (answeredCount < quiz.questions.length) {
      setShowIncompleteSubmitDialog(true);
      return;
    }

    void handleSubmit();
  };

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-0 pb-20 pt-0 md:px-8 md:py-8">
        <header className="hidden items-center justify-between border-b border-border/70 pb-5 md:flex">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{quiz.course_code}</p>
            <h1 className="mt-2 truncate text-2xl font-bold tracking-tight text-foreground md:text-3xl">{quiz.title}</h1>
          </div>
          <div className="ml-4 flex shrink-0 items-center gap-3">
            <div className="inline-flex min-h-10 items-center gap-2 rounded-[5px] bg-[#edf4ff] px-3 text-sm font-semibold text-foreground dark:bg-muted/60">
              <Clock3 className="h-4 w-4 text-primary" />
              <span className={timeRemaining !== null && timeRemaining < 300 ? 'text-red-600' : ''}>
                {timeRemaining !== null ? formatTime(timeRemaining) : '--:--'}
              </span>
            </div>
            <button
              onClick={() => setShowCancelDialog(true)}
              className="shrink-0 rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-600/30 dark:bg-red-900/10"
            >
              Exit
            </button>
          </div>
        </header>

        <header className="sticky top-0 z-30 border-b border-border bg-background pt-[env(safe-area-inset-top)] md:hidden">
          <div className="flex h-16 items-center gap-2.5 px-4">
            <button
              type="button"
              onClick={() => setShowCancelDialog(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground transition-colors active:bg-accent"
              aria-label="Exit quiz"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
            </button>
            <div className="h-6 w-px bg-border" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.82rem] font-semibold text-foreground">{quiz.title}</p>
              <p className="mt-0.5 truncate text-[0.72rem] text-muted-foreground">
                {quiz.course_code}{quiz.topic ? ` - ${quiz.topic}` : ''}
              </p>
            </div>
            <div className="flex min-h-9 shrink-0 items-center gap-1 rounded-[5px] bg-[#edf4ff] px-2.5 text-xs font-semibold text-foreground dark:bg-muted/60">
              <Clock3 className="h-4 w-4 text-primary" />
              <span>{timeRemaining !== null ? formatTime(timeRemaining) : '--:--'}</span>
            </div>
          </div>
        </header>

        <main className="grid flex-1 gap-8 px-6 py-6 md:px-0 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
          <section className="min-w-0">
            <div className="mb-8 hidden max-w-3xl md:block">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Question {currentQuestionIndex + 1}/{quiz.questions.length}</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progressPercentage}%` }} />
              </div>
            </div>

            <div className="max-w-3xl">
              <p className="text-xs font-medium text-muted-foreground md:hidden">Question {currentQuestionIndex + 1}</p>
              <p className="mt-3 text-base leading-7 text-foreground md:mt-4 md:text-lg md:leading-8">{currentQuestionStem}</p>

              <div className="mt-5 space-y-3 md:mt-7">
                {currentQuestion.question_type === 'MCQ' && currentQuestion.options?.map((option, index) => {
                  const selected = Array.isArray(currentAnswer) ? currentAnswer.includes(option) : false;
                  return (
                    <label key={index} className={optionClass(selected)}>
                      <input
                        type="checkbox"
                        name={`question-${currentQuestion.id}`}
                        value={option}
                        checked={selected}
                        onChange={(event) => {
                          let nextAnswers = Array.isArray(currentAnswer) ? [...currentAnswer] : [];
                          if (event.target.checked) {
                            nextAnswers.push(option);
                          } else {
                            nextAnswers = nextAnswers.filter((answer) => answer !== option);
                          }
                          handleAnswerChange(currentQuestion.id, nextAnswers);
                        }}
                        className="sr-only"
                      />
                      <span className={optionDotClass(selected)} />
                      <span className="mr-2 shrink-0 font-bold">{String.fromCharCode(65 + index)}.</span>
                      <span>{stripOptionLabel(option)}</span>
                    </label>
                  );
                })}

                {currentQuestion.question_type === 'TRUE_FALSE' && ['True', 'False'].map((option, index) => (
                  <label key={option} className={optionClass(currentAnswer === option)}>
                    <input
                      type="radio"
                      name={`question-${currentQuestion.id}`}
                      value={option}
                      checked={currentAnswer === option}
                      onChange={(event) => handleAnswerChange(currentQuestion.id, event.target.value)}
                      className="sr-only"
                    />
                    <span className={optionDotClass(currentAnswer === option)} />
                    <span className="mr-2 shrink-0 font-bold">{String.fromCharCode(65 + index)}.</span>
                    <span>{option}</span>
                  </label>
                ))}

                {(currentQuestion.question_type === 'OBJECTIVE' || currentQuestion.question_type === 'multiple_choice') && currentQuestion.options?.map((option, index) => (
                  <label key={index} className={optionClass(currentAnswer === option)}>
                    <input
                      type="radio"
                      name={`question-${currentQuestion.id}`}
                      value={option}
                      checked={currentAnswer === option}
                      onChange={(event) => handleAnswerChange(currentQuestion.id, event.target.value)}
                      className="sr-only"
                    />
                    <span className={optionDotClass(currentAnswer === option)} />
                    <span className="mr-2 shrink-0 font-bold">{String.fromCharCode(65 + index)}.</span>
                    <span>{stripOptionLabel(option)}</span>
                  </label>
                ))}

                {currentQuestion.question_type === 'SHORT_ANSWER' && (
                  <textarea
                    value={currentAnswer}
                    onChange={(event) => handleAnswerChange(currentQuestion.id, event.target.value)}
                    placeholder="Write your answer..."
                    className="min-h-24 w-full resize-none rounded-[5px] border border-border bg-card px-3 py-2 text-[0.9rem] text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 md:min-h-40 md:bg-[#edf4ff] md:px-4 md:py-3 md:text-sm md:dark:bg-muted/60"
                  />
                )}
              </div>

              {error && (
                <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600 dark:border-red-600/30 dark:bg-red-900/10">
                  {error}
                </div>
              )}

              <div className="mt-8 hidden items-center justify-end gap-3 md:flex">
                <button
                  onClick={goPrevious}
                  disabled={currentQuestionIndex === 0}
                  className="inline-flex min-h-11 items-center justify-center rounded-[5px] border border-primary px-6 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent"
                >
                  Previous
                </button>
                {!isFinalQuestion ? (
                  <button
                    onClick={goNext}
                    className="inline-flex min-h-11 items-center justify-center rounded-[5px] bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {currentAnswered ? 'Next' : 'Skip'}
                  </button>
                ) : (
                  <button
                    onClick={handleSubmitAttempt}
                    disabled={isSubmitting}
                    className="inline-flex min-h-11 items-center justify-center rounded-[5px] bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
                  </button>
                )}
              </div>
            </div>
          </section>

          <aside className="hidden space-y-5 lg:sticky lg:top-8 lg:block">
            <div className="rounded-[5px] bg-[#edf4ff] p-5 text-center dark:bg-muted/60">
              <p className="text-3xl font-bold text-foreground">{answeredCount}/{quiz.questions.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">answered questions</p>
            </div>

            {quiz.questions.length > 15 ? (
              <div className="hidden rounded-[5px] bg-[#edf4ff] p-4 dark:bg-muted/60 lg:block">
                <div className="grid grid-cols-6 gap-2">
                  {quiz.questions.map((question, index) => {
                    const answer = userAnswers.find((item) => item.questionId === question.id)?.answer || '';
                    const answered = isAnswered(answer);
                    const current = index === currentQuestionIndex;
                    return (
                      <button
                        key={question.id}
                        type="button"
                        onClick={() => setCurrentQuestionIndex(index)}
                        className={`flex aspect-square min-h-0 items-center justify-center rounded-[5px] border text-[11px] font-bold transition-colors ${
                          current
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : answered
                              ? 'border-primary/20 bg-primary/80 text-primary-foreground hover:bg-primary'
                              : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                        }`}
                        aria-label={`Question ${index + 1}${answered ? ', answered' : ''}`}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="hidden space-y-2 lg:block">
                {quiz.questions.map((question, index) => {
                  const answer = userAnswers.find((item) => item.questionId === question.id)?.answer || '';
                  const answered = isAnswered(answer);
                  const current = index === currentQuestionIndex;
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => setCurrentQuestionIndex(index)}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-[5px] border px-3 text-left text-xs font-medium transition-colors ${
                        current
                          ? 'border-primary bg-[#edf4ff] text-foreground shadow-sm dark:bg-muted/60'
                          : 'border-transparent bg-[#edf4ff]/70 text-muted-foreground hover:border-primary/30 dark:bg-muted/40'
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                        answered ? 'bg-emerald-500 text-white' : 'bg-background text-transparent'
                      }`}>
                        {answered ? '' : ''}
                      </span>
                      Question {index + 1}
                    </button>
                  );
                })}
              </div>
            )}
          </aside>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.7rem)] pt-2.5 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goPrevious}
              disabled={currentQuestionIndex === 0}
              className="inline-flex h-9 w-24 items-center justify-center gap-1 rounded-[5px] bg-accent px-2 text-xs font-medium text-muted-foreground transition-colors active:bg-muted disabled:opacity-45"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="flex-1 text-center text-xs font-medium text-muted-foreground">
              {currentQuestionIndex + 1}/{quiz.questions.length}
            </span>
            {!isFinalQuestion ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!mobileCanGoNext}
                className="inline-flex h-9 w-24 items-center justify-center gap-1 rounded-[5px] bg-primary px-2 text-xs font-semibold text-primary-foreground transition-colors active:bg-primary/90 disabled:opacity-45"
              >
                {currentAnswered ? 'Next' : 'Skip'}
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitAttempt}
                disabled={isSubmitting}
                className="inline-flex h-9 w-24 items-center justify-center rounded-[5px] bg-primary px-2 text-xs font-semibold text-primary-foreground transition-colors active:bg-primary/90 disabled:opacity-45"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            )}
          </div>
        </nav>

        {showCancelDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground">Exit quiz?</h3>
                <button
                  type="button"
                  onClick={() => setShowCancelDialog(false)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Your current answers will not be submitted if you leave now.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowCancelDialog(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Continue
                </button>
                <button
                  onClick={() => router.replace('/quiz')}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Exit quiz
                </button>
              </div>
            </div>
          </div>
        )}

        {showIncompleteSubmitDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
              <h3 className="text-lg font-semibold leading-7 text-foreground">
                You haven&apos;t answered all questions yet ({answeredCount}/{quiz.questions.length}). Are you sure you want to finish now?
              </h3>
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowIncompleteSubmitDialog(false)}
                  className="min-h-11 w-full rounded-[5px] bg-muted px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80"
                >
                  Keep practicing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowIncompleteSubmitDialog(false);
                    void handleSubmit();
                  }}
                  disabled={isSubmitting}
                  className="min-h-11 w-full rounded-[5px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Yes, finish now'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
