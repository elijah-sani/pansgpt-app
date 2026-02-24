import React from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';

interface Analytics {
  averageScore: number;
  totalQuizzes: number;
  totalPoints: number;
  recentTrendAverage: number;
}

export default function QuizSummaryCards({ analytics }: { analytics: Analytics }) {
  const router = useRouter();
  const { theme } = useTheme();
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-gray-50 dark:bg-[#232625] rounded-lg p-6 border border-green-300/40 dark:border-green-700/20">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/60 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-300">Average Score</p>
              <p className="text-2xl font-bold text-theme-primary">{analytics.averageScore.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-[#232625] rounded-lg p-6 border border-blue-300/40 dark:border-blue-700/20">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/60 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Quizzes</p>
              <p className="text-2xl font-bold text-theme-primary">{analytics.totalQuizzes}</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-[#232625] rounded-lg p-6 border border-purple-300/40 dark:border-purple-700/20">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/60 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Total Points</p>
              <p className="text-2xl font-bold text-theme-primary">{analytics.totalPoints}</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-[#232625] rounded-lg p-6 border border-orange-300/40 dark:border-orange-700/20">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/60 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Recent Trend</p>
              <p className="text-2xl font-bold text-theme-primary">
                {analytics.recentTrendAverage > 0
                  ? analytics.recentTrendAverage.toFixed(1) + '%'
                  : '0.0%'}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-2">
        <button
          className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold"
          onClick={() => router.push('/quiz/history')}
        >
          See Full History
        </button>
      </div>
    </div>
  );
} 