'use client';

import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
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
  created_at: string;
  feedback: QuestionResult[];
  quiz?: {
    id: string;
    title: string;
    courseCode: string;
    courseTitle: string;
    topic?: string;
    level: string;
    difficulty: string;
    numQuestions: number;
  };
}

export default function QuizResults({ quizId }: { quizId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resultId = searchParams.get('resultId');

  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExplanations, setShowExplanations] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

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
        setResult(data.result);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (resultId) {
      fetchResult();
    }
  }, [resultId]);

  useEffect(() => {
    if (showShareCard && shareCardRef.current) {
      shareCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showShareCard]);

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return '#00A400';
    if (percentage >= 60) return '#fbbf24';
    return '#dc2626';
  };

  const getScoreMessage = (percentage: number) => {
    if (percentage >= 90) return 'Excellent! Outstanding performance!';
    if (percentage >= 80) return 'Great job! Well done!';
    if (percentage >= 70) return 'Good work! Keep it up!';
    if (percentage >= 60) return 'Not bad! Room for improvement.';
    if (percentage >= 50) return 'You passed! Study more for better results.';
    return 'Keep studying! You can do better next time.';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getCorrectCount = () => {
    return result?.feedback.filter(q => q.isCorrect).length || 0;
  };

  const getIncorrectCount = () => {
    return result?.feedback.filter(q => !q.isCorrect).length || 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:[background-color:#0C120C]">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-600 dark:border-[#00A400]"></div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:[background-color:#0C120C]">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4 text-red-600 dark:text-[#dc2626]">Error</h2>
          <p className="text-gray-600 dark:text-white/70">{error || 'Result not found'}</p>
          <button
            onClick={() => router.push('/quiz')}
            className="mt-4 px-4 py-2 text-white rounded transition-colors bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#008300]"
          >
            Back to Quiz Selection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-900 dark:text-white">
      <div className="max-w-4xl mx-auto px-4">
        {/* Score Summary */}
        <div className="rounded-lg p-8 mb-6 text-center border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Quiz Results</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="text-center">
              <div className="text-4xl font-bold" style={{ color: getScoreColor(result.percentage) }}>
                {result.percentage.toFixed(1)}%
              </div>
              <div className="text-gray-600 dark:text-white/70">Score</div>
            </div>

            <div className="text-center">
              <div className="text-4xl font-bold text-green-600 dark:text-[#00A400]">
                {result.score}/{result.max_score}
              </div>
              <div className="text-gray-600 dark:text-white/70">Points</div>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-lg font-semibold" style={{ color: getScoreColor(result.percentage) }}>
              {getScoreMessage(result.percentage)}
            </p>
          </div>

          {result.time_taken && (
            <div className="text-gray-600 dark:text-white/70">
              Time taken: {formatTime(result.time_taken)}
            </div>
          )}

          <div className="text-sm text-gray-600 dark:text-white/60 mt-2">
            Completed on {new Date(result.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>

          {/* Share Button */}
          <div className="mt-6">
            <button
              onClick={() => setShowShareCard(!showShareCard)}
              className="px-6 py-3 text-white rounded-lg font-medium transition-colors bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#008300]"
            >
              {showShareCard ? 'Hide Share Card' : '📱 Share Results'}
            </button>
          </div>
        </div>

        {/* Share Card */}
        {showShareCard && result.quiz && (
          <div ref={shareCardRef} className="rounded-lg p-8 mb-6 border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 text-center">Share Your Results</h2>
            <QuizShareCard
              result={{
                score: result.score,
                maxScore: result.max_score,
                percentage: result.percentage,
                timeTaken: result.time_taken,
                completedAt: result.created_at,
                quiz: result.quiz
              }}
            />
          </div>
        )}

        {/* Performance Breakdown */}
        <div className="rounded-lg p-6 mb-6 border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Performance Breakdown</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-green-50 dark:bg-[rgba(0,164,0,0.2)] border-green-200 dark:border-[rgba(0,164,0,0.5)]">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full mr-3 bg-green-600 dark:bg-[#00A400]"></div>
                <span className="text-gray-900 dark:text-white font-medium">Correct Answers</span>
              </div>
              <span className="font-semibold text-lg text-gray-900 dark:text-white">{getCorrectCount()}</span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border bg-red-50 dark:bg-[rgba(220,38,38,0.2)] border-red-200 dark:border-[rgba(220,38,38,0.5)]">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full mr-3 bg-red-600 dark:bg-[#dc2626]"></div>
                <span className="text-gray-900 dark:text-white font-medium">Incorrect Answers</span>
              </div>
              <span className="font-semibold text-lg text-gray-900 dark:text-white">{getIncorrectCount()}</span>
            </div>
          </div>
        </div>

        {/* Question Review */}
        <div className="rounded-lg p-6 mb-6 border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Question Review</h2>
            <button
              onClick={() => setShowExplanations(!showExplanations)}
              className="px-4 py-2 text-sm text-white rounded transition-colors bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#008300]"
            >
              {showExplanations ? 'Hide Explanations' : 'Show Explanations'}
            </button>
          </div>

          <div className="space-y-6">
            {result.feedback.map((question, index) => (
              <div key={question.questionId} className="border rounded-lg p-4 bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/20">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Question {index + 1}
                  </h3>
                  <div className="flex items-center">
                    {question.isCorrect ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-900 dark:text-white bg-green-100 dark:bg-[rgba(0,164,0,0.3)] border-[0.5px] border-green-300 dark:border-[rgba(0,164,0,0.5)]">
                        ✓ Correct
                      </span>
                    ) : question.partiallyCorrect ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-900 dark:text-white bg-yellow-100 dark:bg-[rgba(251,191,36,0.3)] border-[0.5px] border-yellow-300 dark:border-[rgba(251,191,36,0.5)]">
                        ~ Partially Correct
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-900 dark:text-white bg-red-100 dark:bg-[rgba(220,38,38,0.3)] border-[0.5px] border-red-300 dark:border-[rgba(220,38,38,0.5)]">
                        ✗ Incorrect
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-gray-900 dark:text-white mb-4">{question.questionText}</p>

                {/* Per-option breakdown for MCQ */}
                {Array.isArray(question.optionDetails) && question.optionDetails.length > 0 ? (
                  <div className="space-y-2 mb-3">
                    <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">Option Breakdown:</label>
                    <ul className="space-y-2">
                      {question.optionDetails.map((opt, i) => (
                        <li
                          key={i}
                          className={`flex items-start justify-between p-3 rounded-lg border ${opt.score === 1
                            ? 'bg-green-50 dark:bg-[rgba(0,164,0,0.2)] border-green-200 dark:border-[rgba(0,164,0,0.5)]'
                            : 'bg-red-50 dark:bg-[rgba(220,38,38,0.2)] border-red-200 dark:border-[rgba(220,38,38,0.5)]'
                            }`}
                        >
                          <div className="flex-1 pr-3">
                            <div className="text-sm text-gray-900 dark:text-white font-medium">{opt.option}</div>
                            <div className="text-xs text-gray-700 dark:text-white/90 mt-1">
                              {opt.userSelected ? 'You selected this' : 'You did not select this'} · {opt.isCorrect ? 'True option' : 'False option'}
                            </div>
                          </div>
                          <div className="ml-3 text-sm font-semibold text-gray-900 dark:text-white">
                            {opt.score === 1 ? '+1' : '-1'}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                        Your Answer:
                      </label>
                      <div
                        className={`p-3 rounded-lg border text-gray-900 dark:text-white ${question.isCorrect
                          ? 'bg-green-50 dark:bg-[rgba(0,164,0,0.2)] border-green-200 dark:border-[rgba(0,164,0,0.5)]'
                          : 'bg-red-50 dark:bg-[rgba(220,38,38,0.2)] border-red-200 dark:border-[rgba(220,38,38,0.5)]'
                          }`}
                      >
                        {question.selectedAnswer || 'No answer provided'}
                      </div>
                    </div>

                    {!question.isCorrect && (
                      <div>
                        <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                          Correct Answer:
                        </label>
                        <div className="p-3 rounded-lg border text-gray-900 dark:text-white bg-green-50 dark:bg-[rgba(0,164,0,0.2)] border-green-200 dark:border-[rgba(0,164,0,0.5)]">
                          {question.correctAnswer}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Show AI feedback only when explanations are toggled */}
                {showExplanations && question.explanation && (
                  <div className="mt-3 p-3 border rounded-lg bg-green-50 dark:bg-[rgba(0,164,0,0.15)] border-green-200 dark:border-[rgba(0,164,0,0.4)]">
                    <label className="block text-sm font-medium mb-1 text-green-600 dark:text-[#00A400]">
                      Feedback:
                    </label>
                    <p className="text-gray-900 dark:text-white/90">{question.explanation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center pb-8">
          <button
            onClick={() => router.push('/quiz')}
            className="px-6 py-3 text-white rounded-lg font-medium transition-colors bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#008300]"
          >
            Take Another Quiz
          </button>
        </div>
      </div>
    </div>
  );
} 