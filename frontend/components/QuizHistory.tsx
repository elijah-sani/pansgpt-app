'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface QuizResult {
  id: string;
  score: number;
  maxScore: number;
  percentage: number;
  timeTaken?: number;
  completedAt: string;
  quiz: {
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

export default function QuizHistory() {
  const [session, setSession] = useState<any>(null);
  useEffect(() => { supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s)); }, []);
  const router = useRouter();
  const [results, setResults] = useState<QuizResult[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    courseCode: '',
    level: ''
  });

  useEffect(() => {
    fetchQuizHistory();
  }, [currentPage, filters, session]);

  const fetchQuizHistory = async () => {
    if (!session?.user?.id) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        userId: session?.user?.id!,
      });

      if (filters.courseCode) params.append('courseCode', filters.courseCode);
      if (filters.level) params.append('level', filters.level);

      const response = await api.get(`/quiz/history?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch quiz history');
      }

      const data = await response.json();
      setResults(data.data?.results || data.quizzes || []);
      setAnalytics(data.data?.analytics || null);
      setPagination(data.data?.pagination || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
    if (percentage >= 80) return '#00A400';
    if (percentage >= 60) return '#fbbf24';
    return '#dc2626';
  };

  const getScoreBadge = (percentage: number) => {
    if (percentage >= 90) return { text: 'Excellent', bgClass: 'bg-green-100 dark:bg-[rgba(0,164,0,0.3)]', borderClass: 'border-green-300 dark:border-[rgba(0,164,0,0.5)]' };
    if (percentage >= 80) return { text: 'Great', bgClass: 'bg-green-100 dark:bg-[rgba(0,164,0,0.3)]', borderClass: 'border-green-300 dark:border-[rgba(0,164,0,0.5)]' };
    if (percentage >= 70) return { text: 'Good', bgClass: 'bg-yellow-100 dark:bg-[rgba(251,191,36,0.3)]', borderClass: 'border-yellow-300 dark:border-[rgba(251,191,36,0.5)]' };
    if (percentage >= 60) return { text: 'Fair', bgClass: 'bg-yellow-100 dark:bg-[rgba(251,191,36,0.3)]', borderClass: 'border-yellow-300 dark:border-[rgba(251,191,36,0.5)]' };
    if (percentage >= 50) return { text: 'Pass', bgClass: 'bg-yellow-100 dark:bg-[rgba(251,191,36,0.3)]', borderClass: 'border-yellow-300 dark:border-[rgba(251,191,36,0.5)]' };
    return { text: 'Needs Work', bgClass: 'bg-red-100 dark:bg-[rgba(220,38,38,0.3)]', borderClass: 'border-red-300 dark:border-[rgba(220,38,38,0.5)]' };
  };

  if (!session) {
    return (
      <div className="text-center">
        <div className="rounded-lg p-6 border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Quiz History</h2>
          <p className="text-gray-600 dark:text-white/70">Please sign in to view your quiz history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Quiz History</h1>
          <p className="text-gray-600 dark:text-gray-900 dark:text-white/70">Track your performance and progress over time</p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
          <button
            onClick={() => router.push('/main')}
            className="inline-flex items-center px-4 py-2 border text-sm font-medium rounded-lg text-gray-900 dark:text-white transition-all bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            Back to AI Chat
          </button>
          <button
            onClick={() => router.push('/quiz')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white transition-all bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#00B400]"
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
          <div className="rounded-lg p-6 border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-green-100 dark:bg-[rgba(0,164,0,0.2)]">
                <svg className="w-6 h-6 text-green-600 dark:text-[#00A400]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-white/80">Average Score</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.averageScore.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-6 border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-green-100 dark:bg-[rgba(0,164,0,0.2)]">
                <svg className="w-6 h-6 text-green-600 dark:text-[#00A400]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-900 dark:text-white/80">Total Quizzes</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.totalQuizzes}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-6 border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-green-100 dark:bg-[rgba(0,164,0,0.2)]">
                <svg className="w-6 h-6 text-green-600 dark:text-[#00A400]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-900 dark:text-white/80">Total Points</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.totalPoints}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-6 border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-green-100 dark:bg-[rgba(0,164,0,0.2)]">
                <svg className="w-6 h-6 text-green-600 dark:text-[#00A400]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-900 dark:text-white/80">Recent Trend</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
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
      <div className="rounded-lg p-6 mb-6 border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
              Course Code
            </label>
            <input
              type="text"
              value={filters.courseCode}
              onChange={(e) => handleFilterChange('courseCode', e.target.value)}
              placeholder="Filter by course code"
              className="w-full px-3 py-2 border rounded-md text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-600 dark:focus:ring-[#00A400] bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
              Level
            </label>
            <select
              value={filters.level}
              onChange={(e) => handleFilterChange('level', e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-600 dark:focus:ring-[#00A400] bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20"
            >
              <option value="" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">All Levels</option>
              <option value="100" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">100</option>
              <option value="200" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">200</option>
              <option value="300" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">300</option>
              <option value="400" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">400</option>
              <option value="500" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">500</option>
              <option value="600" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">600</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setFilters({ courseCode: '', level: '' });
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 text-gray-900 dark:text-white rounded-lg transition-all border border-gray-300 dark:border-white/10 bg-white dark:bg-[#2D3A2D] hover:bg-gray-50 dark:hover:bg-white/5"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Quiz Results */}
      <div className="rounded-lg border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Quizzes</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto border-green-600 dark:border-[#00A400]"></div>
            <p className="mt-2 text-gray-600 dark:text-white/70">Loading quiz history...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-green-600 dark:text-[#00A400]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No quizzes found</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-white/70">Start by taking your first quiz!</p>
            <div className="mt-6">
              <button
                onClick={() => router.push('/quiz')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white transition-all bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#00B400]"
              >
                Take a Quiz
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-white/10">
            {results.map((item: any) => {
              // The backend returns a list of quizzes, each with a nested `result` object
              const quizData = item;
              const resultData = item.result;

              if (!resultData) return null;

              const scoreBadge = getScoreBadge(resultData.percentage);
              const scoreColor = getScoreColor(resultData.percentage);
              return (
                <div
                  key={resultData.id}
                  className="p-6 cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/5"
                  onClick={() => router.push(`/quiz/${quizData.id}/results?resultId=${resultData.id}`)}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1 w-full">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                          {quizData.title}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-900 dark:text-white/70 mt-1">
                        {quizData.course_code} - {quizData.course_title}
                      </p>
                      {quizData.topic && (
                        <p className="text-sm text-gray-600 dark:text-gray-900 dark:text-white/70 mt-1">Topic: {quizData.topic}</p>
                      )}
                      <div className="flex flex-wrap items-center mt-2 space-x-4 text-sm text-gray-600 dark:text-gray-900 dark:text-white/70">
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
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-900 dark:text-white border-[0.5px] ${scoreBadge.bgClass} ${scoreBadge.borderClass}`}>
                          {scoreBadge.text}
                        </span>
                        <div className="text-2xl font-bold" style={{ color: scoreColor }}>
                          {resultData.percentage.toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-900 dark:text-white/70">
                        {resultData.score}/{resultData.max_score} points
                      </div>
                      <div className="text-xs text-gray-900 dark:text-white/60 mt-1">
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
          <div className="px-6 py-4 border-t border-gray-200 dark:border-white/10">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-white/70">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} results
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${currentPage === 1
                    ? 'text-gray-400 dark:text-white/30 cursor-not-allowed'
                    : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer'
                    }`}
                >
                  Previous
                </button>
                <span className="px-3 py-2 text-sm text-gray-600 dark:text-white/70">
                  Page {currentPage} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
                  disabled={currentPage === pagination.totalPages}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${currentPage === pagination.totalPages
                    ? 'text-gray-400 dark:text-white/30 cursor-not-allowed'
                    : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer'
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
        <div className="mt-8 rounded-lg border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Performance by Course</h2>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-white/10">
            {analytics.coursePerformance.map((course, index) => {
              const courseScoreColor = getScoreColor(course.averageScore);
              return (
                <div key={index} className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        {course.courseCode} - {course.courseTitle}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-900 dark:text-white/70">Level {course.level}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold" style={{ color: courseScoreColor }}>
                        {course.averageScore.toFixed(1)}%
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-900 dark:text-white/70">
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