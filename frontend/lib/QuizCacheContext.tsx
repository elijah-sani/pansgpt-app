'use client';

import React, { createContext, useContext, useMemo, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';

export interface QuizDocument {
  course_code?: string;
  title?: string;
  topic?: string;
  level?: string;
  material_status?: 'active' | 'archived' | string;
  academic_session?: string;
  semester?: string;
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
  const pathname = usePathname();
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
  const documentsRequestRef = useRef<Promise<void> | null>(null);
  const userLevelRequestRef = useRef<Promise<void> | null>(null);
  const quizHistoryRequestRef = useRef<Promise<void> | null>(null);

  const isQuizGenerationRoute = /^\/quiz\/generating\/[^/]+$/.test(pathname || '');

  const courses = useMemo(() => {
    const seen = new Set<string>();
    const nextCourses: QuizCourse[] = [];

    for (const doc of documents) {
      if (String(doc.material_status || 'active').toLowerCase() !== 'active') {
        continue;
      }
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

  const fetchDocuments = useCallback(async (force = false) => {
    if (isQuizGenerationRoute && !force) {
      return;
    }
    if ((documentsLoaded || documents.length > 0) && !force) {
      return;
    }
    if (documentsRequestRef.current && !force) {
      return documentsRequestRef.current;
    }

    const request = (async () => {
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
        documentsRequestRef.current = null;
      }
    })();
    documentsRequestRef.current = request;
    return request;
  }, [documents.length, documentsLoaded, isQuizGenerationRoute]);

  const fetchUserLevel = useCallback(async (force = false) => {
    if (isQuizGenerationRoute && !force) {
      return;
    }
    if ((userLevelLoaded || userLevel) && !force) {
      return;
    }
    if (userLevelRequestRef.current && !force) {
      return userLevelRequestRef.current;
    }

    const request = (async () => {
      const response = await api.get('/me/bootstrap');
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setUserLevel(data?.profile?.level || '');
      setUserLevelLoaded(true);
    })().finally(() => {
      userLevelRequestRef.current = null;
    });
    userLevelRequestRef.current = request;
    return request;
  }, [isQuizGenerationRoute, userLevel, userLevelLoaded]);

  const fetchQuizHistory = useCallback(async (force = false) => {
    if (isQuizGenerationRoute && !force) {
      return;
    }
    if (quizHistoryLoaded && !force) {
      return;
    }
    if (quizHistoryRequestRef.current && !force) {
      return quizHistoryRequestRef.current;
    }

    const request = (async () => {
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
        quizHistoryRequestRef.current = null;
      }
    })();
    quizHistoryRequestRef.current = request;
    return request;
  }, [isQuizGenerationRoute, quizHistoryLoaded]);

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
      fetchDocuments,
      fetchQuizHistory,
      fetchUserLevel,
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
