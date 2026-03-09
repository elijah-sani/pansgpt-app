'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import MobileBottomSheet from '@/components/MobileBottomSheet';

interface QuizPerformanceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface NormalizedQuizResult {
    title: string;
    date: string;
    score: string;
    percentage: number;
    timeTakenSec: number;
}

export default function QuizPerformanceModal({ isOpen, onClose }: QuizPerformanceModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recentQuizzes, setRecentQuizzes] = useState<NormalizedQuizResult[]>([]);
    const [stats, setStats] = useState({
        averageScore: 0,
        quizzesCompleted: 0,
        avgTimeMinutes: 0,
    });

    useEffect(() => {
        if (!isOpen) return;

        const fetchPerformance = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const userId = session?.user?.id;
                if (!userId) {
                    setRecentQuizzes([]);
                    setStats({ averageScore: 0, quizzesCompleted: 0, avgTimeMinutes: 0 });
                    return;
                }

                const response = await api.get(`/api/quiz/history?userId=${encodeURIComponent(userId)}&limit=20`);
                if (!response.ok) throw new Error('Failed to load quiz performance.');

                const payload = await response.json();
                const rawItems = Array.isArray(payload?.quizzes)
                    ? payload.quizzes
                    : Array.isArray(payload?.data?.results)
                        ? payload.data.results
                        : [];

                const normalized = rawItems
                    .map((item: any) => {
                        const quiz = item?.quiz || item;
                        const result = item?.result || item?.result_data || null;
                        if (!result) return null;

                        const score = Number(result.score ?? 0);
                        const maxScore = Number(result.max_score ?? result.maxScore ?? 0);
                        const percentage = Number(result.percentage ?? (maxScore > 0 ? (score / maxScore) * 100 : 0));
                        const timeTakenSec = Number(result.time_taken ?? result.timeTaken ?? 0);
                        const dateSource = result.completed_at || result.created_at || quiz.created_at || null;

                        return {
                            title: quiz.title || quiz.course_title || quiz.course_code || 'Untitled Quiz',
                            date: dateSource
                                ? new Date(dateSource).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : 'N/A',
                            score: maxScore > 0 ? `${score}/${maxScore}` : `${score}`,
                            percentage,
                            timeTakenSec: Number.isFinite(timeTakenSec) ? timeTakenSec : 0,
                        } as NormalizedQuizResult;
                    })
                    .filter((item: NormalizedQuizResult | null): item is NormalizedQuizResult => item !== null);

                const quizzesCompleted = normalized.length;
                const averageScore = quizzesCompleted > 0
                    ? normalized.reduce((sum: number, quiz: NormalizedQuizResult) => sum + quiz.percentage, 0) / quizzesCompleted
                    : 0;
                const avgTimeMinutes = quizzesCompleted > 0
                    ? normalized.reduce((sum: number, quiz: NormalizedQuizResult) => sum + quiz.timeTakenSec, 0) / quizzesCompleted / 60
                    : 0;

                setStats({ averageScore, quizzesCompleted, avgTimeMinutes });
                setRecentQuizzes(normalized.slice(0, 3));
            } catch (err) {
                console.error('Failed to fetch quiz performance', err);
                const message = err instanceof Error ? err.message : 'Unable to load quiz performance.';
                setError(message);
                setRecentQuizzes([]);
                setStats({ averageScore: 0, quizzesCompleted: 0, avgTimeMinutes: 0 });
            } finally {
                setIsLoading(false);
            }
        };

        void fetchPerformance();
    }, [isOpen]);

    const topStats = [
        { label: 'Average Score', value: `${stats.averageScore.toFixed(1)}%` },
        { label: 'Quizzes Completed', value: `${stats.quizzesCompleted}` },
        { label: 'Avg. Time', value: `${Math.round(stats.avgTimeMinutes)} mins` },
    ];
    const modalContent = (
        <>
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/30">
                <h2 className="text-lg font-bold text-foreground">Quiz Performance</h2>
                <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                </button>
            </div>

            <div className="p-5 space-y-6 overflow-y-auto bg-background/50">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {topStats.map((stat, index) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.04 }}
                            className="rounded-xl border border-border bg-card px-4 py-3.5"
                        >
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                            <p className="mt-2 text-2xl font-bold text-foreground">{stat.value}</p>
                        </motion.div>
                    ))}
                </div>

                <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">Recent Quizzes</h3>
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        {isLoading && (
                            <div className="px-4 py-6 text-sm text-muted-foreground">Loading quiz history...</div>
                        )}
                        {!isLoading && error && (
                            <div className="px-4 py-6 text-sm text-destructive">{error}</div>
                        )}
                        {!isLoading && !error && recentQuizzes.length === 0 && (
                            <div className="px-4 py-6 text-sm text-muted-foreground">No completed quizzes yet.</div>
                        )}
                        {!isLoading && !error && recentQuizzes.map((quiz, index) => (
                            <div
                                key={`${quiz.title}-${quiz.date}-${index}`}
                                className={`px-4 py-3.5 flex items-center justify-between gap-3 ${
                                    index < recentQuizzes.length - 1 ? 'border-b border-border/60' : ''
                                }`}
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">{quiz.title}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {quiz.date} - {quiz.score}
                                    </p>
                                </div>
                                <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border border-primary/30 bg-primary/10 text-primary">
                                    {quiz.percentage.toFixed(1)}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );

    if (!isOpen) return null;

    return (
        <>
            <MobileBottomSheet isOpen={isOpen} onClose={onClose}>
                <div className="bg-card flex flex-col max-h-[90vh]">
                    {modalContent}
                </div>
            </MobileBottomSheet>

            <div className="hidden md:block">
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
                        onClick={onClose}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {modalContent}
                        </motion.div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </>
    );
}
