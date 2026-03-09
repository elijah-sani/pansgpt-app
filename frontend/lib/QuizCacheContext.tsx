'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import { api } from '@/lib/api';

export interface QuizDocument {
  course_code?: string;
  title?: string;
  topic?: string;
  level?: string;
}

export interface QuizCourse {
  courseCode: string;
  courseTitle: string;
  level: string;
}

type QuizHistoryPayload = {
  results: any[];
  analytics: any | null;
  pagination: any | null;
};

type QuizCacheContextType = {
  documents: QuizDocument[];
  courses: QuizCourse[];
  documentsLoaded: boolean;
  documentsLoading: boolean;
  userLevel: string;
  userLevelLoaded: boolean;
  quizHistory: QuizHistoryPayload;
  quizHistoryLoaded: boolean;
  quizHistoryLoading: boolean;
  fetchDocuments: (force?: boolean) => Promise<void>;
  fetchUserLevel: (force?: boolean) => Promise<void>;
  fetchQuizHistory: (force?: boolean) => Promise<void>;
};

const QuizCacheContext = createContext<QuizCacheContextType | null>(null);

export function QuizCacheProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<QuizDocument[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [userLevel, setUserLevel] = useState('');
  const [userLevelLoaded, setUserLevelLoaded] = useState(false);
  const [quizHistory, setQuizHistory] = useState<QuizHistoryPayload>({
    results: [],
    analytics: null,
    pagination: null,
  });
  const [quizHistoryLoaded, setQuizHistoryLoaded] = useState(false);
  const [quizHistoryLoading, setQuizHistoryLoading] = useState(false);

  const courses = useMemo(() => {
    const seen = new Set<string>();
    const nextCourses: QuizCourse[] = [];

    for (const doc of documents) {
      if (!doc.course_code || seen.has(doc.course_code)) {
        continue;
      }
      seen.add(doc.course_code);
      nextCourses.push({
        courseCode: doc.course_code,
        courseTitle: doc.title || doc.course_code,
        level: doc.level || '',
      });
    }

    return nextCourses;
  }, [documents]);

  const fetchDocuments = async (force = false) => {
    if ((documentsLoaded || documents.length > 0) && !force) {
      return;
    }

    setDocumentsLoading(true);
    try {
      const response = await api.get('/documents');
      if (!response.ok) {
        throw new Error('Failed to load documents');
      }
      const data = await response.json();
      setDocuments(data || []);
      setDocumentsLoaded(true);
    } finally {
      setDocumentsLoading(false);
    }
  };

  const fetchUserLevel = async (force = false) => {
    if ((userLevelLoaded || userLevel) && !force) {
      return;
    }

    const response = await api.get('/me/bootstrap');
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    setUserLevel(data?.profile?.level || '');
    setUserLevelLoaded(true);
  };

  const fetchQuizHistory = async (force = false) => {
    if (quizHistoryLoaded && !force) {
      return;
    }

    setQuizHistoryLoading(true);
    try {
      const response = await api.get('/api/quiz/history?limit=50');
      if (!response.ok) {
        throw new Error('Failed to fetch quiz history');
      }

      const data = await response.json();
      setQuizHistory({
        results: data.data?.results || data.quizzes || [],
        analytics: data.data?.analytics || null,
        pagination: data.data?.pagination || null,
      });
      setQuizHistoryLoaded(true);
    } finally {
      setQuizHistoryLoading(false);
    }
  };

  const value = useMemo(
    () => ({
      documents,
      courses,
      documentsLoaded,
      documentsLoading,
      userLevel,
      userLevelLoaded,
      quizHistory,
      quizHistoryLoaded,
      quizHistoryLoading,
      fetchDocuments,
      fetchUserLevel,
      fetchQuizHistory,
    }),
    [
      courses,
      documents,
      documentsLoaded,
      documentsLoading,
      quizHistory,
      quizHistoryLoaded,
      quizHistoryLoading,
      userLevel,
      userLevelLoaded,
    ]
  );

  return <QuizCacheContext.Provider value={value}>{children}</QuizCacheContext.Provider>;
}

export function useQuizCache() {
  const context = useContext(QuizCacheContext);
  if (!context) {
    throw new Error('useQuizCache must be used within QuizCacheProvider');
  }
  return context;
}
