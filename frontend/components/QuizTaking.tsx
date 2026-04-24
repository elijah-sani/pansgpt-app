'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

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

        // Initialize user answers
        const initialAnswers = data.quiz.questions.map((q: Question) => ({
          questionId: q.id,
          answer: ''
        }));
        setUserAnswers(initialAnswers);

        // Set time limit if exists
        if (data.quiz.time_limit) {
          setTimeRemaining(data.quiz.time_limit * 60); // Convert to seconds
        }

        setStartTime(new Date());
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Quiz not found';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    if (quizId) {
      fetchQuiz();
    }
  }, [quizId]);

  const handleAnswerChange = (questionId: string, answer: string | string[]) => {
    setUserAnswers(prev =>
      prev.map(a =>
        a.questionId === questionId ? { ...a, answer } : a
      )
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
        userId: userId || "",
        answers: userAnswers.map(a => ({
          questionId: a.questionId,
          selectedAnswer: Array.isArray(a.answer) ? JSON.stringify(a.answer) : a.answer
        })),
        timeTaken
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit quiz');
      }

      // Navigate to results page
      router.push(`/quiz/${quizId}/results?resultId=${data.result.id}`);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit quiz';
      setError(message);
      setIsSubmitting(false);
    }
  }, [quiz, startTime, userId, userAnswers, quizId, router]);

  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) {
      return;
    }

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
  }, [timeRemaining, handleSubmit]);

  const handleNext = () => {
    if (currentQuestionIndex < (quiz?.questions.length || 0) - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const getProgressPercentage = () => {
    if (!quiz) return 0;
    return ((currentQuestionIndex + 1) / quiz.questions.length) * 100;
  };

  const getAnsweredCount = () => {
    return userAnswers.filter(a => {
      if (typeof a.answer === 'string') {
        return a.answer.trim() !== '';
      } else if (Array.isArray(a.answer)) {
        return a.answer.length > 0;
      }
      return false;
    }).length;
  };

  const handleCancelQuiz = () => {
    setShowCancelDialog(true);
  };

  const confirmCancel = () => {
    router.replace('/quiz');
  };

  const cancelCancel = () => {
    setShowCancelDialog(false);
  };

  const canProceed = () => {
    if (currentQuestion.question_type === 'MCQ') {
      // Allow proceeding with any number of selections (including 0)
      return true;
    }
    if (currentQuestion.question_type === 'SHORT_ANSWER' || currentQuestion.question_type === 'OBJECTIVE' || currentQuestion.question_type === 'multiple_choice') {
      return typeof currentAnswer === 'string' && currentAnswer.trim().length > 0;
    }
    return true;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2" style={{ borderColor: 'var(--primary)' }}></div>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#dc2626' }}>Error</h2>
          <p className="text-muted-foreground">{error || 'Quiz not found'}</p>
          <button
            onClick={() => router.push('/quiz')}
            className="mt-4 px-4 py-2 text-white rounded transition-colors bg-primary dark:bg-primary hover:bg-primary/90 dark:hover:bg-primary/90"
          >
            Back to Quiz Selection
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const currentAnswer = userAnswers.find(a => a.questionId === currentQuestion.id)?.answer || '';
  const currentQuestionStem = getQuestionStem(currentQuestion.question_text, currentQuestion.options);

  return (
    <div className="min-h-screen overflow-y-auto text-foreground py-8 bg-background">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header with Close Button */}
        <div className="flex justify-end items-center mb-4">
          <button
            onClick={handleCancelQuiz}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors"
            style={{
              color: '#dc2626',
              borderColor: 'rgba(220, 38, 38, 0.3)',
              backgroundColor: 'rgba(220, 38, 38, 0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.1)';
            }}
            title="Cancel Quiz"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Cancel Quiz
          </button>
        </div>

        {/* Header */}
        <div className="rounded-lg p-6 mb-6 border bg-card border-border">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{quiz.title}</h1>
              <p className="text-foreground font-medium">{quiz.course_code} - {quiz.course_title}</p>
              {quiz.topic && <p className="text-muted-foreground">Topic: {quiz.topic}</p>}
            </div>
            <div className="text-right">
              {timeRemaining !== null && (
                <div className="text-lg font-semibold" style={{ color: timeRemaining < 300 ? '#dc2626' : 'white' }}>
                  {formatTime(timeRemaining)}
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Level {quiz.level} • {quiz.difficulty}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Question {currentQuestionIndex + 1} of {quiz.questions.length}</span>
              <span>{getAnsweredCount()} answered</span>
            </div>
            <div className="w-full rounded-full h-2 bg-muted/70">
              <div
                className="h-2 rounded-full transition-all duration-300 bg-primary dark:bg-primary"
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Question */}
        <div className="rounded-lg p-6 mb-6 border bg-card border-border">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              Question {currentQuestion.question_order}
            </h2>
            <p className="text-lg text-foreground mb-6">{currentQuestionStem}</p>

            {/* Answer Options */}
            {currentQuestion.question_type === 'MCQ' && currentQuestion.options && (
              <div className="space-y-3">
                {currentQuestion.options.map((option, index) => {
                  const selected = Array.isArray(currentAnswer) ? currentAnswer.includes(option) : false;
                  return (
                    <label
                      key={index}
                      className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${selected
                        ? 'bg-primary/10 dark:bg-primary/15 border-primary dark:border-primary/40'
                        : 'bg-input-background border-border hover:bg-accent'
                        }`}
                    >
                      <input
                        type="checkbox"
                        name={`question-${currentQuestion.id}`}
                        value={option}
                        checked={selected}
                        onChange={e => {
                          let newAnswers = Array.isArray(currentAnswer) ? [...currentAnswer] : [];
                          if (e.target.checked) {
                            newAnswers.push(option);
                          } else {
                            newAnswers = newAnswers.filter(ans => ans !== option);
                          }
                          handleAnswerChange(currentQuestion.id, newAnswers);
                        }}
                        className="h-4 w-4"
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      <span className="ml-3 text-foreground">{option}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {currentQuestion.question_type === 'TRUE_FALSE' && (
              <div className="space-y-3">
                {['True', 'False'].map((option) => (
                  <label
                    key={option}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${currentAnswer === option
                      ? 'bg-primary/10 dark:bg-primary/15 border-primary dark:border-primary/40'
                      : 'bg-input-background border-border hover:bg-accent'
                      }`}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestion.id}`}
                      value={option}
                      checked={currentAnswer === option}
                      onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                      className="h-4 w-4"
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span className="ml-3 text-foreground">{option}</span>
                  </label>
                ))}
              </div>
            )}

            {(currentQuestion.question_type === 'OBJECTIVE' || currentQuestion.question_type === 'multiple_choice') && currentQuestion.options && (
              <div className="space-y-3">
                {currentQuestion.options.map((option, index) => (
                  <label
                    key={index}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${currentAnswer === option
                      ? 'bg-primary/10 dark:bg-primary/15 border-primary dark:border-primary/40'
                      : 'bg-input-background border-border hover:bg-accent'
                      }`}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestion.id}`}
                      value={option}
                      checked={currentAnswer === option}
                      onChange={e => handleAnswerChange(currentQuestion.id, e.target.value)}
                      className="h-4 w-4"
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span className="ml-3 text-foreground">{option}</span>
                  </label>
                ))}
              </div>
            )}

            {currentQuestion.question_type === 'SHORT_ANSWER' && (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <textarea
                    value={currentAnswer}
                    onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                    placeholder={'Write your answer...'}
                    className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-primary dark:focus:ring-primary focus:border-transparent resize-none text-foreground placeholder:text-muted-foreground bg-input-background border-border"
                    rows={4}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={currentQuestionIndex === 0}
            className="px-6 py-2 border rounded-md transition-all"
            style={
              currentQuestionIndex === 0
                ? {
                  color: 'rgba(255, 255, 255, 0.3)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  cursor: 'not-allowed',
                  backgroundColor: 'transparent'
                }
                : {
                  color: 'white',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'transparent'
                }
            }
            onMouseEnter={(e) => {
              if (currentQuestionIndex !== 0) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentQuestionIndex !== 0) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            Previous
          </button>

          <div className="flex space-x-4">
            {currentQuestionIndex < quiz.questions.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className={`px-6 py-2 text-white rounded-md transition-all ${!canProceed()
                  ? 'bg-primary/40 dark:bg-primary/50 cursor-not-allowed'
                  : 'bg-primary dark:bg-primary hover:bg-primary/90 dark:hover:bg-primary/90 cursor-pointer'
                  }`}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canProceed() || isSubmitting}
                className="px-6 py-2 text-foreground rounded-md transition-all"
                style={{
                  backgroundColor: (!canProceed() || isSubmitting) ? 'color-mix(in srgb, var(--primary), transparent 50%)' : 'var(--primary)',
                  cursor: (!canProceed() || isSubmitting) ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={(e) => {
                  if (!canProceed() || isSubmitting) return;
                  e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--primary), black 20%)';
                }}
                onMouseLeave={(e) => {
                  if (!canProceed() || isSubmitting) return;
                  e.currentTarget.style.backgroundColor = 'var(--primary)';
                }}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
              </button>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 border rounded-lg" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', borderColor: 'rgba(220, 38, 38, 0.3)', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {/* Cancel Confirmation Dialog */}
        {showCancelDialog && (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}>
            <div className="rounded-lg p-6 max-w-md mx-4 border bg-card border-border">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 w-10 h-10 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(220, 38, 38, 0.2)' }}>
                  <svg className="w-6 h-6" style={{ color: '#dc2626' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Cancel Quiz?
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Are you sure you want to cancel this quiz? Your progress will be lost and you&apos;ll need to start over.
                </p>
                <div className="flex space-x-3 justify-center">
                  <button
                    onClick={cancelCancel}
                    className="px-4 py-2 text-sm font-medium text-foreground rounded-md transition-colors"
                    style={{ backgroundColor: 'var(--surface-secondary)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'}
                  >
                    Continue Quiz
                  </button>
                  <button
                    onClick={confirmCancel}
                    className="px-4 py-2 text-sm font-medium text-foreground rounded-md transition-colors"
                    style={{ backgroundColor: '#dc2626' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                  >
                    Cancel Quiz
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 




