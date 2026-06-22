"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  BarChart3,
  BookOpen,
  Eye,
  PanelLeft,
  Plus,
  Trophy,
} from "lucide-react";
import { useSidebarTrigger } from "@/lib/sidebar-controls";
import { useQuizCache } from "@/lib/QuizCacheContext";
import { api } from "@/lib/api";
import QuizBuilderModal, { type QuizGenerationJob } from "@/components/QuizBuilderModal";

type QuizHistoryResult = {
  id: string;
  percentage: number;
  score: number;
  max_score: number;
  created_at?: string;
  completed_at?: string;
};

type QuizHistoryEntry = {
  id: string;
  title: string;
  course_code?: string;
  course_title?: string;
  topic?: string;
  level?: string;
  difficulty?: string;
  question_type?: string;
  num_questions?: number;
  result?: QuizHistoryResult;
};

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

function StatCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/90 p-4 transition-colors md:rounded-lg md:bg-card md:p-5">
      <div className="flex flex-col-reverse items-start gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground md:text-sm">{label}</p>
          <p className="mt-2 text-xl font-bold text-foreground md:text-2xl">{value}</p>
          {helper ? <p className="mt-1 hidden text-xs text-muted-foreground md:block">{helper}</p> : null}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary md:h-10 md:w-10 md:rounded-lg md:border-0">
          <Icon className="h-4 w-4 md:h-5 md:w-5" />
        </div>
      </div>
    </div>
  );
}

export default function QuizPage() {
  const router = useRouter();
  const openSidebar = useSidebarTrigger();
  const { quizHistory, quizHistoryLoaded, quizHistoryLoading, fetchQuizHistory } = useQuizCache();
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem("pansgpt-active-quiz-job-id")) {
      return;
    }
    if (quizHistoryLoaded || quizHistory.results.length > 0) return;
    void fetchQuizHistory().catch(() => {});
  }, [fetchQuizHistory, quizHistory.results.length, quizHistoryLoaded]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setIsBuilderOpen(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") return;
    const storedJobId = window.localStorage.getItem("pansgpt-active-quiz-job-id");
    if (!storedJobId) return;

    let cancelled = false;
    const checkStoredJob = async () => {
      try {
        const response = await api.get(`/api/quiz/jobs/${storedJobId}`);
        const rawText = await response.clone().text().catch(() => "");
        const data = rawText ? JSON.parse(rawText) : {};
        const status = data.job?.status;

        if (cancelled) return;
        if (!response.ok || status === "completed" || status === "failed" || status === "cancelled") {
          window.localStorage.removeItem("pansgpt-active-quiz-job-id");
          return;
        }

        router.replace(`/quiz/generating/${storedJobId}`);
      } catch {
        if (!cancelled) {
          window.localStorage.removeItem("pansgpt-active-quiz-job-id");
        }
      }
    };

    void checkStoredJob();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const openBuilder = () => setIsBuilderOpen(true);
  const closeBuilder = () => {
    setIsBuilderOpen(false);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1") {
      router.replace("/quiz");
    }
  };

  const handleJobCreated = (job: QuizGenerationJob) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("pansgpt-active-quiz-job-id", job.id);
    }
    router.push(`/quiz/generating/${job.id}`);
  };

  const allResults = useMemo(
    () => (quizHistory.results || []).filter((entry): entry is QuizHistoryEntry => Boolean(entry?.result)),
    [quizHistory.results],
  );

  const recentResults = allResults.slice(0, 3);
  const hasHistory = allResults.length > 0;
  const analytics = quizHistory.analytics as {
    averageScore?: number;
    totalQuizzes?: number;
    totalPoints?: number;
  } | null;
  const bestScore = allResults.reduce((best, entry) => Math.max(best, entry.result?.percentage || 0), 0);
  const totalQuizzes = analytics?.totalQuizzes ?? allResults.length;
  const averageScore = analytics?.averageScore ?? (
    allResults.length > 0
      ? allResults.reduce((sum, entry) => sum + (entry.result?.percentage || 0), 0) / allResults.length
      : 0
  );
  const totalPoints = analytics?.totalPoints ?? allResults.reduce((sum, entry) => sum + (entry.result?.score || 0), 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-card/95 px-4 py-3 backdrop-blur-sm md:hidden">
        <button onClick={openSidebar} className="mr-2 rounded-lg p-2 text-foreground transition-colors hover:bg-accent">
          <PanelLeft size={20} />
        </button>
        <span className="text-sm font-semibold">Quiz</span>
      </div>

      <main className="mx-auto flex w-full max-w-[23.5rem] flex-col gap-6 px-5 pb-12 pt-6 sm:max-w-[26rem] sm:px-6 md:max-w-7xl md:gap-8 md:px-8 md:py-10 lg:px-8">
        <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <h1 className="hidden text-3xl font-semibold tracking-tight text-foreground md:block md:text-4xl md:font-bold">Quiz</h1>
            <p className="mt-2 text-sm text-muted-foreground md:mt-3 md:text-lg">
              Test your understanding, practise key topics, and track your progress.
            </p>
          </div>
          {hasHistory ? (
            <button
              type="button"
              onClick={openBuilder}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-primary/15 bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:min-h-11 md:rounded-lg md:py-2.5 md:self-start"
            >
              <Plus className="h-4 w-4" />
              New Quiz
            </button>
          ) : null}
        </header>

        {!hasHistory && !quizHistoryLoading ? (
          <section className="rounded-lg border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">No quizzes yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Create your first quiz to test your understanding and start tracking your progress.
            </p>
            <button
              type="button"
              onClick={openBuilder}
              className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create your first quiz
            </button>
          </section>
        ) : null}

        {hasHistory ? (
          <section className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            <StatCard icon={BookOpen} label="Total quizzes" value={String(totalQuizzes)} />
            <StatCard icon={BarChart3} label="Average score" value={`${averageScore.toFixed(1)}%`} helper="Across completed attempts" />
            <StatCard icon={Trophy} label="Best score" value={`${bestScore.toFixed(1)}%`} />
            <StatCard icon={Award} label="Total points" value={String(totalPoints)} />
          </section>
        ) : null}

        <section>
          <div className="flex flex-col gap-4 py-4 md:border-b md:border-border">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground md:text-lg md:normal-case md:tracking-normal md:text-foreground">Recent quizzes</h2>
              <p className="mt-1 hidden text-sm text-muted-foreground md:block">Review your latest attempts and explanations.</p>
            </div>
          </div>

          {quizHistoryLoading && !hasHistory ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading quiz history...</div>
          ) : recentResults.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No recent quizzes yet.</div>
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
                    {recentResults.map((entry) => {
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
                            <div className="hidden">
                              {entry.level ? `${entry.level} Level` : "Practice"} · {formatDifficulty(entry.difficulty)}
                            </div>
                            <div className="hidden">
                              {entry.level ? `${entry.level} Level` : "Practice"} · {formatDifficulty(entry.difficulty)}
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
                              className="text-xs font-semibold text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2.5 md:hidden">
                {recentResults.map((entry) => {
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
                          <p className="hidden">
                            {entry.course_code || "Course"} - {entry.course_title || "General practice"}
                          </p>
                          <p className="hidden">
                            {entry.course_code || "Course"} · {entry.course_title || "General practice"}
                          </p>
                          <p className="hidden">
                            {entry.course_code || "Course"} · {entry.course_title || "General practice"}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border border-border bg-card px-2 py-1 text-[11px] font-semibold ${scoreColor(result.percentage)}`}>
                          {result.percentage.toFixed(0)}%
                        </span>
                      </div>
                      <p className="hidden">
                        {entry.num_questions || "-"} questions · {formatDifficulty(entry.difficulty)} · Completed {formatDate(result.completed_at || result.created_at)}
                      </p>
                      <button
                        type="button"
                        onClick={() => router.push(`/quiz/${entry.id}/results?resultId=${result.id}`)}
                        className="hidden"
                      >
                        <Eye className="h-4 w-4" />
                        View result
                      </button>
                    </article>
                  );
                })}
              </div>

              {hasHistory ? (
                <button
                  type="button"
                  onClick={() => router.push("/quiz/history")}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                >
                  View all history
                </button>
              ) : null}
            </>
          )}
        </section>
      </main>
      <QuizBuilderModal isOpen={isBuilderOpen} onClose={closeBuilder} onJobCreated={handleJobCreated} />
    </div>
  );
}
