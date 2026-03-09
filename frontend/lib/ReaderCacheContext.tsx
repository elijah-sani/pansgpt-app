'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

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
}

type ReaderCacheContextType = {
  documents: ReaderDocument[];
  setDocuments: React.Dispatch<React.SetStateAction<ReaderDocument[]>>;
  hasLoadedDocuments: boolean;
  setHasLoadedDocuments: React.Dispatch<React.SetStateAction<boolean>>;
  lastOpenedDocument: ReaderDocument | null;
  setLastOpenedDocument: React.Dispatch<React.SetStateAction<ReaderDocument | null>>;
};

const ReaderCacheContext = createContext<ReaderCacheContextType | null>(null);

export function ReaderCacheProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<ReaderDocument[]>([]);
  const [hasLoadedDocuments, setHasLoadedDocuments] = useState(false);
  const [lastOpenedDocument, setLastOpenedDocument] = useState<ReaderDocument | null>(null);

  const value = useMemo(
    () => ({
      documents,
      setDocuments,
      hasLoadedDocuments,
      setHasLoadedDocuments,
      lastOpenedDocument,
      setLastOpenedDocument,
    }),
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
