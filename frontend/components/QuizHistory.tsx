"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, Filter, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuizCache } from "@/lib/QuizCacheContext";
import { useChatSession } from "@/lib/ChatSessionContext";

interface QuizHistoryEntryResult {
  id: string;
  percentage: number;
  score: number;
  max_score: number;
  created_at?: string;
  completed_at?: string;
}

interface QuizHistoryEntry {
  id: string;
  title: string;
  course_code?: string;
  course_title?: string;
  topic?: string;
  level?: string;
  difficulty?: string;
  num_questions?: number;
  result?: QuizHistoryEntryResult;
}

function formatDate(date?: string) {
  if (!date) return "Recently";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Recently";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDifficulty(value?: string) {
  if (!value) return "Practice";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function scoreColor(percentage: number) {
  if (percentage >= 80) return "text-primary";
  if (percentage >= 60) return "text-amber-500";
  return "text-red-500";
}

export default function QuizHistory() {
  const router = useRouter();
  const { setPendingPath } = useChatSession();
  const { quizHistory, quizHistoryLoaded, quizHistoryLoading, fetchQuizHistory } = useQuizCache();
  const [courseCode, setCourseCode] = useState("");
  const [level, setLevel] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (quizHistoryLoaded || quizHistory.results.length > 0) return;
    void fetchQuizHistory().catch(() => {});
  }, [fetchQuizHistory, quizHistory.results.length, quizHistoryLoaded]);

  useEffect(() => {
    if (!filtersOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!filtersRef.current?.contains(target)) {
        setFiltersOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [filtersOpen]);

  const results = useMemo(() => {
    const entries = (quizHistory.results || []).filter((entry): entry is QuizHistoryEntry => Boolean(entry?.result));
    return entries.filter((entry) => {
      const matchesCourse = courseCode.trim()
        ? (entry.course_code || "").toLowerCase().includes(courseCode.trim().toLowerCase())
        : true;
      const matchesLevel = level ? String(entry.level || "") === level : true;
      return matchesCourse && matchesLevel;
    });
  }, [courseCode, level, quizHistory.results]);

  const hasActiveFilters = Boolean(courseCode.trim() || level);
  const loading = quizHistoryLoading && !quizHistoryLoaded;

  const clearFilters = () => {
    setCourseCode("");
    setLevel("");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <button
            type="button"
            onClick={() => { setPendingPath("/quiz"); router.push("/quiz"); }}
            className="mb-3 hidden items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80 md:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Quiz
          </button>
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Quiz History</h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">Review all completed quiz attempts.</p>
        </div>

        <div className="relative" ref={filtersRef}>
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted md:w-auto"
            aria-expanded={filtersOpen}
          >
            <Filter className="h-4 w-4 text-muted-foreground" />
            Filters
            {hasActiveFilters ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
          </button>

          {filtersOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-border bg-card p-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">Filter history</h2>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="quiz-history-course" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Course code
                  </label>
                  <input
                    id="quiz-history-course"
                    type="text"
                    value={courseCode}
                    onChange={(event) => setCourseCode(event.target.value)}
                    placeholder="PHA 421"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="quiz-history-level" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Level
                  </label>
                  <select
                    id="quiz-history-level"
                    value={level}
                    onChange={(event) => setLevel(event.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/40"
                  >
                    <option value="">All levels</option>
                    {["100", "200", "300", "400", "500", "600"].map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button type="button" onClick={clearFilters} className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted">
                  Clear
                </button>
                <button type="button" onClick={() => setFiltersOpen(false)} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                  Apply
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {courseCode.trim() ? <FilterChip label={`Course: ${courseCode.trim()}`} onClear={() => setCourseCode("")} /> : null}
          {level ? <FilterChip label={`Level: ${level}`} onClear={() => setLevel("")} /> : null}
          <button type="button" onClick={clearFilters} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            Clear all
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading quiz history...</div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <h2 className="text-sm font-semibold text-foreground">No quizzes found</h2>
          <p className="mt-2 text-sm text-muted-foreground">Completed quizzes will appear here.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left">
              <thead className="bg-muted/30">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Quiz</th>
                  <th className="px-6 py-3 font-medium">Course</th>
                  <th className="px-6 py-3 text-right font-medium">Questions</th>
                  <th className="px-6 py-3 text-right font-medium">Score</th>
                  <th className="px-6 py-3 font-medium">Completed</th>
                  <th className="px-6 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((entry) => {
                  const result = entry.result;
                  if (!result) return null;

                  return (
                    <tr
                      key={result.id}
                      onClick={() => router.push(`/quiz/${entry.id}/results?resultId=${result.id}`)}
                      className="cursor-pointer border-t border-border align-top transition-colors first:border-t-0 hover:bg-muted/35"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{entry.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {entry.level ? `${entry.level} Level` : "Practice"} - {formatDifficulty(entry.difficulty)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{entry.course_code || "Course"}</div>
                        <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">{entry.course_title || entry.topic || "General practice"}</div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-foreground">{entry.num_questions || "-"}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex min-w-12 justify-center rounded-full bg-background px-2.5 py-1 text-xs font-bold ${scoreColor(result.percentage)}`}>
                          {result.percentage.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{formatDate(result.completed_at || result.created_at)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/quiz/${entry.id}/results?resultId=${result.id}`);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View result
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 md:hidden">
            {results.map((entry) => {
              const result = entry.result;
              if (!result) return null;

              return (
                <article
                  key={result.id}
                  onClick={() => router.push(`/quiz/${entry.id}/results?resultId=${result.id}`)}
                  className="cursor-pointer rounded-2xl border border-border bg-background/90 p-4 transition-colors hover:border-primary/30 hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium text-foreground">{entry.title}</h3>
                      <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">
                        {entry.course_code || "Course"} - {formatDate(result.completed_at || result.created_at)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border border-border bg-card px-2 py-1 text-[11px] font-semibold ${scoreColor(result.percentage)}`}>
                      {result.percentage.toFixed(0)}%
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      {label}
      <button type="button" onClick={onClear} className="rounded-full p-0.5 hover:bg-primary/10" aria-label={`Clear ${label}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
