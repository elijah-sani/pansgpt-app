// [DESKTOP UI SECURITY]
"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

export type ActiveRestriction = {
  course_code?: string | null;
  course_title?: string | null;
  title?: string | null;
  reason?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  lecturer_title?: string | null;
  lecturer_full_name?: string | null;
  university_name?: string | null;
  level?: string | null;
};

export type RestrictionStatusResponse = {
  restricted: boolean;
  restriction: ActiveRestriction | null;
};

export function useStudentRestrictions() {
  const [restriction, setRestriction] = useState<ActiveRestriction | null>(null);
  const [isRestrictionLoading, setIsRestrictionLoading] = useState(true);
  const [restrictionNow, setRestrictionNow] = useState(() => Date.now());
  const [isUniversitySuspended, setIsUniversitySuspended] = useState(false);

  const loadRestrictionStatus = useCallback(async ({ foreground = false }: { foreground?: boolean } = {}) => {
    if (foreground) {
      setIsRestrictionLoading(true);
    }

    try {
      const response = await api.get("/me/restriction-status");
      if (!response.ok) {
        setRestriction(null);
        return;
      }

      const data = (await response.json()) as RestrictionStatusResponse;
      setRestriction(data.restricted ? data.restriction : null);
    } catch (error) {
      console.error("Failed to load restriction status:", error);
      setRestriction(null);
    } finally {
      setIsRestrictionLoading(false);
    }
  }, []);

  const resetRestrictions = useCallback(() => {
    setRestriction(null);
    setIsRestrictionLoading(false);
    setIsUniversitySuspended(false);
  }, []);

  // Update countdown clock every second when restriction is active
  useEffect(() => {
    if (!restriction) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRestrictionNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [restriction]);

  // Schedule auto-reload when restriction.end_time passes
  useEffect(() => {
    if (!restriction?.end_time) {
      return;
    }

    const endAt = new Date(restriction.end_time).getTime();
    if (Number.isNaN(endAt)) {
      return;
    }

    const delay = Math.max(endAt - Date.now(), 0) + 1000;
    const timeoutId = window.setTimeout(() => {
      void loadRestrictionStatus();
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [restriction?.end_time, loadRestrictionStatus]);

  return {
    restriction,
    setRestriction,
    isRestrictionLoading,
    restrictionNow,
    isUniversitySuspended,
    setIsUniversitySuspended,
    loadRestrictionStatus,
    resetRestrictions,
  };
}
