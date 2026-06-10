'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export interface ReaderDocument {
  id?: number;
  created_at?: string;
  title?: string;
  course_code?: string;
  lecturer_name?: string;
  topic?: string;
  drive_file_id: string;
  file_name?: string;
  file_size?: number;
  material_status?: 'active' | 'archived' | string;
  academic_session?: string;
  semester?: string;
}

const LS_KEY = 'pansgpt_documents_cache';
const LS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Read the cached document list from localStorage — returns [] if missing or stale. */
function readFromCache(): ReaderDocument[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { ts: number; data: ReaderDocument[] };
    if (Date.now() - parsed.ts > LS_TTL_MS) {
      localStorage.removeItem(LS_KEY);
      return [];
    }
    return parsed.data || [];
  } catch {
    return [];
  }
}

/** Persist the document list to localStorage with a timestamp. */
function writeToCache(docs: ReaderDocument[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), data: docs }));
  } catch { /* quota exceeded - ignore */ }
}

/** Invalidate the cache (call when a new document is ingested). */
export function invalidateDocumentCache() {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

type ReaderCacheContextType = {
  documents: ReaderDocument[];
  setDocuments: (docs: ReaderDocument[]) => void;
  hasLoadedDocuments: boolean;
  setHasLoadedDocuments: React.Dispatch<React.SetStateAction<boolean>>;
  lastOpenedDocument: ReaderDocument | null;
  setLastOpenedDocument: React.Dispatch<React.SetStateAction<ReaderDocument | null>>;
  /** Call to bust the cache and force a fresh fetch on next mount. */
  invalidateCache: () => void;
};

const ReaderCacheContext = createContext<ReaderCacheContextType | null>(null);

export function ReaderCacheProvider({ children }: { children: React.ReactNode }) {
  // Seed state from localStorage immediately so the page renders with cached data
  const [documents, setDocumentsRaw] = useState<ReaderDocument[]>(() => {
    if (typeof window === 'undefined') return [];
    return readFromCache();
  });
  const [hasLoadedDocuments, setHasLoadedDocuments] = useState(() => {
    if (typeof window === 'undefined') return false;
    return readFromCache().length > 0;
  });
  const [lastOpenedDocument, setLastOpenedDocument] = useState<ReaderDocument | null>(null);

  /** Wraps setState to also persist to localStorage. */
  const setDocuments = (docs: ReaderDocument[]) => {
    setDocumentsRaw(docs);
    writeToCache(docs);
  };

  const invalidateCache = () => {
    invalidateDocumentCache();
    setHasLoadedDocuments(false);
  };

  // Background revalidation: always fetch fresh from backend on mount,
  // but don't block the UI (cached data already shows instantly).
  const hasRevalidated = useRef(false);
  useEffect(() => {
    if (hasRevalidated.current) return;
    hasRevalidated.current = true;

    const revalidate = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          return;
        }

        const res = await api.fetch('/documents');
        if (!res.ok) return;
        const fresh: ReaderDocument[] = await res.json();
        setDocuments(fresh);
        setHasLoadedDocuments(true);
      } catch {
        // Non-fatal: cached data remains visible
      }
    };
    void revalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      documents,
      setDocuments,
      hasLoadedDocuments,
      setHasLoadedDocuments,
      lastOpenedDocument,
      setLastOpenedDocument,
      invalidateCache,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents, hasLoadedDocuments, lastOpenedDocument]
  );

  return <ReaderCacheContext.Provider value={value}>{children}</ReaderCacheContext.Provider>;
}

export function useReaderCache() {
  const context = useContext(ReaderCacheContext);
  if (!context) {
    throw new Error('useReaderCache must be used within ReaderCacheProvider');
  }
  return context;
}
