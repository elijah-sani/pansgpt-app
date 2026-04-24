'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useQuizCache } from '@/lib/QuizCacheContext';

interface Analytics {
  averageScore: number;
  totalQuizzes: number;
  totalPoints: number;
  coursePerformance: Array<{
    courseCode: string;
    courseTitle: string;
    level: string;
    averageScore: number;
    quizCount: number;
  }>;
  recentTrend: Array<{
    percentage: number;
    completedAt: string;
    courseCode: string;
    title: string;
  }>;
  recentTrendAverage: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface QuizHistoryEntryResult {
  id: string;
  percentage: number;
  score: number;
  max_score: number;
  time_taken?: number;
  created_at?: string;
  completed_at?: string;
}

interface QuizHistoryEntry {
  id: string;
  title: string;
  course_code: string;
  course_title: string;
  topic?: string;
  level: string;
  difficulty: string;
  num_questions: number;
  result?: QuizHistoryEntryResult;
}

export default function QuizHistory() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => { supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s)); }, []);
  const router = useRouter();
  const { quizHistory, quizHistoryLoaded, quizHistoryLoading, fetchQuizHistory } = useQuizCache();
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    courseCode: '',
    level: ''
  });
  const loading = quizHistoryLoading && !quizHistoryLoaded;

  useEffect(() => {
    if (!session?.user?.id) return;
    if (quizHistoryLoaded || quizHistory.results.length > 0) {
      return;
    }
    void fetchQuizHistory().catch((err: Error) => setError(err.message));
  }, [fetchQuizHistory, quizHistory.results.length, quizHistoryLoaded, session]);

  const results = useMemo(() => {
    let filteredResults = [...(quizHistory.results as QuizHistoryEntry[])];

    if (filters.courseCode) {
      const courseCodeFilter = filters.courseCode.toLowerCase();
      filteredResults = filteredResults.filter((item) =>
        item.course_code?.toLowerCase().includes(courseCodeFilter)
      );
    }

    if (filters.level) {
      filteredResults = filteredResults.filter((item) => item.level === filters.level);
    }

    return filteredResults;
  }, [filters, quizHistory.results]);

  const analytics = quizHistory.analytics as Analytics | null;
  const pagination = quizHistory.pagination as Pagination | null;

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'var(--primary)';
    if (percentage >= 60) return '#fbbf24';
    return '#dc2626';
  };

  const getScoreBadge = (percentage: number) => {
    if (percentage >= 90) return { text: 'Excellent', bgClass: 'bg-primary/10 dark:bg-primary/20', borderClass: 'border-primary/30 dark:border-primary/40' };
    if (percentage >= 80) return { text: 'Great', bgClass: 'bg-primary/10 dark:bg-primary/20', borderClass: 'border-primary/30 dark:border-primary/40' };
    if (percentage >= 70) return { text: 'Good', bgClass: 'bg-yellow-100 dark:bg-[rgba(251,191,36,0.3)]', borderClass: 'border-yellow-300 dark:border-[rgba(251,191,36,0.5)]' };
    if (percentage >= 60) return { text: 'Fair', bgClass: 'bg-yellow-100 dark:bg-[rgba(251,191,36,0.3)]', borderClass: 'border-yellow-300 dark:border-[rgba(251,191,36,0.5)]' };
    if (percentage >= 50) return { text: 'Pass', bgClass: 'bg-yellow-100 dark:bg-[rgba(251,191,36,0.3)]', borderClass: 'border-yellow-300 dark:border-[rgba(251,191,36,0.5)]' };
    return { text: 'Needs Work', bgClass: 'bg-red-100 dark:bg-[rgba(220,38,38,0.3)]', borderClass: 'border-red-300 dark:border-[rgba(220,38,38,0.5)]' };
  };

  if (!session) {
    return (
      <div className="text-center">
        <div className="rounded-lg p-6 border bg-card border-border">
          <h2 className="text-2xl font-bold text-foreground mb-4">Quiz History</h2>
          <p className="text-muted-foreground">Please sign in to view your quiz history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Quiz History</h1>
          <p className="text-muted-foreground">Track your performance and progress over time</p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
          <button
            onClick={() => {
              setError(null);
              void fetchQuizHistory(true).catch((err: Error) => setError(err.message));
            }}
            className="inline-flex items-center gap-2 px-4 py-2 border text-sm font-medium rounded-lg text-foreground transition-all bg-card border-border hover:bg-accent"
          >
            <RefreshCw className={`h-4 w-4 ${quizHistoryLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => router.push('/main')}
            className="inline-flex items-center px-4 py-2 border text-sm font-medium rounded-lg text-foreground transition-all bg-card border-border hover:bg-accent"
          >
            Back to AI Chat
          </button>
          <button
            onClick={() => router.push('/quiz')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white transition-all bg-primary dark:bg-primary hover:bg-primary/90 dark:hover:bg-primary/90"
          >
            Take New Quiz
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 border rounded-lg bg-red-50 dark:bg-[rgba(220,38,38,0.1)] border-red-200 dark:border-[rgba(220,38,38,0.3)]">
          <p className="text-red-600 dark:text-[#dc2626]">{error}</p>
        </div>
      )}

      {/* Analytics Overview */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="rounded-lg p-6 border bg-card border-border">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-primary/10 dark:bg-primary/15">
                <svg className="w-6 h-6 text-primary dark:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Average Score</p>
                <p className="text-2xl font-bold text-foreground">{analytics.averageScore.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-6 border bg-card border-border">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-primary/10 dark:bg-primary/15">
                <svg className="w-6 h-6 text-primary dark:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Quizzes</p>
                <p className="text-2xl font-bold text-foreground">{analytics.totalQuizzes}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-6 border bg-card border-border">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-primary/10 dark:bg-primary/15">
                <svg className="w-6 h-6 text-primary dark:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Points</p>
                <p className="text-2xl font-bold text-foreground">{analytics.totalPoints}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-6 border bg-card border-border">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-primary/10 dark:bg-primary/15">
                <svg className="w-6 h-6 text-primary dark:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Recent Trend</p>
                <p className="text-2xl font-bold text-foreground">
                  {analytics.recentTrendAverage > 0
                    ? analytics.recentTrendAverage.toFixed(1) + '%'
                    : 'N/A'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg p-6 mb-6 border bg-card border-border">
        <h2 className="text-lg font-semibold text-foreground mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Course Code
            </label>
            <input
              type="text"
              value={filters.courseCode}
              onChange={(e) => handleFilterChange('courseCode', e.target.value)}
              placeholder="Filter by course code"
              className="w-full px-3 py-2 border rounded-md text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-primary bg-input-background border-border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Level
            </label>
            <select
              value={filters.level}
              onChange={(e) => handleFilterChange('level', e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-primary bg-input-background border-border"
            >
              <option value="" className="bg-card text-foreground">All Levels</option>
              <option value="100" className="bg-card text-foreground">100</option>
              <option value="200" className="bg-card text-foreground">200</option>
              <option value="300" className="bg-card text-foreground">300</option>
              <option value="400" className="bg-card text-foreground">400</option>
              <option value="500" className="bg-card text-foreground">500</option>
              <option value="600" className="bg-card text-foreground">600</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setFilters({ courseCode: '', level: '' });
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 text-foreground rounded-lg transition-all border border-border bg-card hover:bg-accent"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Quiz Results */}
      <div className="rounded-lg border bg-card border-border">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Recent Quizzes</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto border-primary dark:border-primary/40"></div>
            <p className="mt-2 text-muted-foreground">Loading quiz history...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-primary dark:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-foreground">No quizzes found</h3>
            <p className="mt-1 text-sm text-muted-foreground">Start by taking your first quiz!</p>
            <div className="mt-6">
              <button
                onClick={() => router.push('/quiz')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white transition-all bg-primary dark:bg-primary hover:bg-primary/90 dark:hover:bg-primary/90"
              >
                Take a Quiz
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {results.map((item) => {
              // The backend returns a list of quizzes, each with a nested `result` object
              const quizData = item;
              const resultData = item.result;

              if (!resultData) return null;

              const scoreBadge = getScoreBadge(resultData.percentage);
              const scoreColor = getScoreColor(resultData.percentage);
              return (
                <div
                  key={resultData.id}
                  className="p-6 cursor-pointer transition hover:bg-accent"
                  onClick={() => router.push(`/quiz/${quizData.id}/results?resultId=${resultData.id}`)}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1 w-full">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-foreground">
                          {quizData.title}
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {quizData.course_code} - {quizData.course_title}
                      </p>
                      {quizData.topic && (
                        <p className="text-sm text-muted-foreground mt-1">Topic: {quizData.topic}</p>
                      )}
                      <div className="flex flex-wrap items-center mt-2 space-x-4 text-sm text-muted-foreground">
                        <span>Level {quizData.level}</span>
                        <span>•</span>
                        <span>{quizData.difficulty}</span>
                        <span>•</span>
                        <span>{quizData.num_questions} questions</span>
                        {resultData.time_taken && (
                          <>
                            <span>•</span>
                            <span>{formatTime(resultData.time_taken)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end w-full md:w-auto md:ml-6 mt-4 md:mt-0">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-foreground border-[0.5px] ${scoreBadge.bgClass} ${scoreBadge.borderClass}`}>
                          {scoreBadge.text}
                        </span>
                        <div className="text-2xl font-bold" style={{ color: scoreColor }}>
                          {resultData.percentage.toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {resultData.score}/{resultData.max_score} points
                      </div>
                      <div className="text-xs text-foreground/60 mt-1">
                        {new Date(resultData.created_at || resultData.completed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} results
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${currentPage === 1
                    ? 'text-muted-foreground/50 cursor-not-allowed'
                    : 'text-foreground hover:bg-accent cursor-pointer'
                    }`}
                >
                  Previous
                </button>
                <span className="px-3 py-2 text-sm text-muted-foreground">
                  Page {currentPage} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
                  disabled={currentPage === pagination.totalPages}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${currentPage === pagination.totalPages
                    ? 'text-muted-foreground/50 cursor-not-allowed'
                    : 'text-foreground hover:bg-accent cursor-pointer'
                    }`}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Course Performance */}
      {analytics && analytics.coursePerformance.length > 0 && (
        <div className="mt-8 rounded-lg border bg-card border-border">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Performance by Course</h2>
          </div>
          <div className="divide-y divide-border">
            {analytics.coursePerformance.map((course, index) => {
              const courseScoreColor = getScoreColor(course.averageScore);
              return (
                <div key={index} className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-foreground">
                        {course.courseCode} - {course.courseTitle}
                      </h3>
                      <p className="text-sm text-muted-foreground">Level {course.level}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold" style={{ color: courseScoreColor }}>
                        {course.averageScore.toFixed(1)}%
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {course.quizCount} quiz{course.quizCount !== 1 ? 'zes' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
} 




