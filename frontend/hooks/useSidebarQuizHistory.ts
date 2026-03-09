'use client';

import { useEffect, useState } from 'react';
import type { QuizFilters, QuizHistoryItem } from '@/components/sidebar/types';
import { useQuizCache } from '@/lib/QuizCacheContext';

export function useSidebarQuizHistory(isOnQuiz: boolean) {
  const [quizResults, setQuizResults] = useState<QuizHistoryItem[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [quizFilters, setQuizFilters] = useState<QuizFilters>({ courseCode: '', level: '' });
  const [draftFilters, setDraftFilters] = useState<QuizFilters>({ courseCode: '', level: '' });
  const [allQuizResults, setAllQuizResults] = useState<QuizHistoryItem[]>([]);
  const { quizHistory, quizHistoryLoaded, quizHistoryLoading, fetchQuizHistory } = useQuizCache();

  useEffect(() => {
    if (!isOnQuiz) {
      return;
    }

    if (quizHistoryLoaded || quizHistory.results.length > 0) {
      return;
    }

    setQuizLoading(true);
    void fetchQuizHistory()
      .catch(() => {})
      .finally(() => setQuizLoading(false));
  }, [fetchQuizHistory, isOnQuiz, quizHistory.results.length, quizHistoryLoaded]);

  useEffect(() => {
    setAllQuizResults((quizHistory.results || []) as QuizHistoryItem[]);
    if (!quizHistoryLoading) {
      setQuizLoading(false);
    }
  }, [quizHistory.results, quizHistoryLoading]);

  useEffect(() => {
    let filtered = allQuizResults;

    if (quizFilters.courseCode) {
      filtered = filtered.filter((quiz) =>
        quiz.course_code?.toLowerCase().includes(quizFilters.courseCode.toLowerCase())
      );
    }

    if (quizFilters.level) {
      filtered = filtered.filter((quiz) => quiz.level === quizFilters.level);
    }

    setQuizResults(filtered);
  }, [allQuizResults, quizFilters]);

  const applyFilters = () => {
    setQuizFilters(draftFilters);
    setShowFilterModal(false);
  };

  const clearFilters = () => {
    const empty = { courseCode: '', level: '' };
    setDraftFilters(empty);
    setQuizFilters(empty);
    setShowFilterModal(false);
  };

  return {
    applyFilters,
    clearFilters,
    draftFilters,
    quizFilters,
    quizLoading,
    quizResults,
    setDraftFilters,
    setShowFilterModal,
    showFilterModal,
    hasActiveFilters: Boolean(quizFilters.courseCode || quizFilters.level),
  };
}
