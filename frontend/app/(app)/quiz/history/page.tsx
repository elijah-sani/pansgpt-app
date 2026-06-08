"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import QuizHistory from "@/components/QuizHistory";

export default function QuizHistoryPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-card/95 px-4 py-3 backdrop-blur-sm md:hidden">
        <button onClick={() => router.push("/quiz")} className="mr-2 rounded-lg p-2 text-foreground transition-colors hover:bg-accent" aria-label="Back to Quiz">
          <ArrowLeft size={20} />
        </button>
        <span className="text-sm font-semibold">Quiz History</span>
      </div>

      <main className="mx-auto flex w-full max-w-[23.5rem] flex-col gap-6 px-5 pb-12 pt-6 sm:max-w-[26rem] sm:px-6 md:max-w-7xl md:gap-8 md:px-8 md:py-10 lg:px-8">
        <QuizHistory />
      </main>
    </div>
  );
}
