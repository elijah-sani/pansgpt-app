// [DESKTOP TABS] Context & state management for multi-document tabs persistence
"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";

export interface DocumentTab {
  id: string; // unique identifier (e.g. drive_file_id or db id)
  title: string;
  drive_file_id: string;
  course_code?: string;
  course_title?: string;
  lecturer_name?: string;
  topic?: string;
  file_name?: string;
  file_size?: number;
  academic_session?: string;
  semester?: string;
  db_id?: number;
}

export interface PersistedTabData {
  openTabs: DocumentTab[];
  activeTabId: string | null;
}

interface DocumentTabsContextType {
  openTabs: DocumentTab[];
  activeTabId: string | null;
  openTab: (doc: Partial<DocumentTab> & { title: string; drive_file_id: string }) => void;
  closeTab: (id: string) => void;
  setActiveTabId: (id: string | null) => void;
  isLoadingPersistedTabs: boolean;
}

const DocumentTabsContext = createContext<DocumentTabsContextType | null>(null);

export function DocumentTabsProvider({ children }: { children: ReactNode }) {
  const [openTabs, setOpenTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isLoadingPersistedTabs, setIsLoadingPersistedTabs] = useState<boolean>(true);
  const isInitialMount = useRef<boolean>(true);

  // 1. On mount: load persisted tabs if in Electron
  useEffect(() => {
    async function loadTabs() {
      if (typeof window !== "undefined" && (window as any).electronAPI?.getPersistedTabs) {
        try {
          const data: PersistedTabData = await (window as any).electronAPI.getPersistedTabs();
          if (data && Array.isArray(data.openTabs)) {
            setOpenTabs(data.openTabs);
            if (data.activeTabId && data.openTabs.some((t) => t.id === data.activeTabId)) {
              setActiveTabId(data.activeTabId);
            } else if (data.activeTabId === null) {
              setActiveTabId(null);
            } else if (data.openTabs.length > 0) {
              setActiveTabId(data.openTabs[0].id);
            }
          }
        } catch (err) {
          console.warn("[DESKTOP TABS] Failed to load persisted tabs:", err);
        }
      }
      setIsLoadingPersistedTabs(false);
    }

    void loadTabs();
  }, []);

  // 2. On openTabs/activeTabId change: debounced save to disk if in Electron
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (typeof window === "undefined" || !(window as any).electronAPI?.setPersistedTabs) {
      return;
    }

    const timer = setTimeout(() => {
      const payload: PersistedTabData = {
        openTabs,
        activeTabId,
      };
      (window as any).electronAPI.setPersistedTabs(payload).catch((err: any) => {
        console.warn("[DESKTOP TABS] Failed to persist tabs:", err);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [openTabs, activeTabId]);

  // Add or switch to document tab
  const openTab = (docInput: Partial<DocumentTab> & { title: string; drive_file_id: string }) => {
    const tabId = docInput.id || docInput.drive_file_id;

    setOpenTabs((prev) => {
      const existing = prev.find((t) => t.id === tabId || t.drive_file_id === docInput.drive_file_id);
      if (existing) {
        return prev;
      }
      const newTab: DocumentTab = {
        id: tabId,
        title: docInput.title || "Untitled Document",
        drive_file_id: docInput.drive_file_id,
        course_code: docInput.course_code,
        course_title: docInput.course_title,
        lecturer_name: docInput.lecturer_name,
        topic: docInput.topic,
        file_name: docInput.file_name,
        file_size: docInput.file_size,
        academic_session: docInput.academic_session,
        semester: docInput.semester,
        db_id: docInput.db_id,
      };
      return [...prev, newTab];
    });

    setActiveTabId(tabId);
  };

  // Close document tab and adjust active tab
  const closeTab = (idToClose: string) => {
    setOpenTabs((prev) => {
      const indexToClose = prev.findIndex((t) => t.id === idToClose);
      if (indexToClose < 0) return prev;

      const updated = prev.filter((t) => t.id !== idToClose);

      if (activeTabId === idToClose) {
        if (updated.length === 0) {
          setActiveTabId(null);
        } else {
          const newActiveIndex = Math.max(0, indexToClose - 1);
          setActiveTabId(updated[newActiveIndex].id);
        }
      }

      return updated;
    });
  };

  return (
    <DocumentTabsContext.Provider
      value={{
        openTabs,
        activeTabId,
        openTab,
        closeTab,
        setActiveTabId,
        isLoadingPersistedTabs,
      }}
    >
      {children}
    </DocumentTabsContext.Provider>
  );
}

export function useDocumentTabs() {
  const ctx = useContext(DocumentTabsContext);
  if (!ctx) {
    return {
      openTabs: [],
      activeTabId: null,
      openTab: () => {},
      closeTab: () => {},
      setActiveTabId: () => {},
      isLoadingPersistedTabs: false,
    };
  }
  return ctx;
}
