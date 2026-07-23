'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AnimatePresence, motion } from 'framer-motion';
import { Combobox } from '@headlessui/react';
import { ArrowLeft, ChevronDown, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useQuizCache } from '@/lib/QuizCacheContext';
import MobileBottomSheet from '@/components/MobileBottomSheet';

type QuizBuilderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onJobCreated?: (job: QuizGenerationJob) => void;
};

export type QuizGenerationJob = {
  id: string;
  status: 'queued' | 'retrieving' | 'generating' | 'saving' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_step?: string;
  error_message?: string | null;
  quiz_id?: string | null;
};

type QuizFormData = {
  courseCode: string;
  courseTitle: string;
  topic: string;
  numQuestions: number;
  questionType: 'MCQ' | 'TRUE_FALSE' | 'OBJECTIVE' | 'SHORT_ANSWER';
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit?: number;
};

const steps = ['Quiz content', 'Quiz format', 'Optional settings'];

const inputClass =
  'w-full rounded-xl border border-border bg-input-background px-4 py-3 text-base text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 md:text-sm';

export default function QuizBuilderModal({ isOpen, onClose, onJobCreated }: QuizBuilderModalProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [formData, setFormData] = useState<QuizFormData>({
    courseCode: '',
    courseTitle: '',
    topic: '',
    numQuestions: 10,
    questionType: 'OBJECTIVE',
    difficulty: 'medium',
    timeLimit: undefined,
  });

  const {
    courses,
    documents,
    documentsLoaded,
    documentsLoading,
    fetchDocuments,
  } = useQuizCache();

  useEffect(() => {
    if (!isOpen) return;
    supabase.auth.getSession().then(({ data: { session: nextSession } }) => setSession(nextSession));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (documentsLoaded || documents.length > 0) return;
    void fetchDocuments().catch((err) => console.error('Failed to fetch courses:', err));
  }, [documents.length, documentsLoaded, fetchDocuments, isOpen]);

  const topicOptions = useMemo(() => {
    const activeDocuments = documents.filter((doc) => String(doc.material_status || 'active').toLowerCase() === 'active');
    const relevantDocuments = formData.courseCode
      ? activeDocuments.filter((doc) => doc.course_code === formData.courseCode)
      : activeDocuments;
    return [
      ...new Set(
        relevantDocuments
          .map((document) => document.topic)
          .filter((topic): topic is string => Boolean(topic && topic.trim())),
      ),
    ];
  }, [documents, formData.courseCode]);

  const filteredTopics = useMemo(() => {
    if (!formData.topic || showAllTopics) return topicOptions;
    return topicOptions.filter((topic) => topic.toLowerCase().includes(formData.topic.toLowerCase()));
  }, [formData.topic, showAllTopics, topicOptions]);

  const handleCourseSelect = (courseCode: string) => {
    if (!courseCode) {
      setFormData((prev) => ({ ...prev, courseCode: '', courseTitle: '', topic: '' }));
      return;
    }
    const course = courses.find((item) => item.courseCode === courseCode);
    if (!course) return;
    setFormData((prev) => ({
      ...prev,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle,
      topic: '',
    }));
  };

  const updateField = <K extends keyof QuizFormData>(key: K, value: QuizFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const canContinue = () => {
    if (stepIndex === 0) return Boolean(formData.courseCode && formData.courseTitle);
    return true;
  };

  const handleGenerate = async () => {
    if (!formData.courseCode || !formData.courseTitle) {
      setError('Please select a course');
      setStepIndex(0);
      return;
    }
    if (!session?.user?.id) {
      setError('User session not found. Please log in again.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setInfo(null);

    try {
      const response = await api.post('/api/quiz/jobs', {
        courseCode: formData.courseCode,
        courseTitle: formData.courseTitle,
        topic: formData.topic,
        numQuestions: formData.numQuestions,
        questionType: formData.questionType,
        difficulty: formData.difficulty,
        timeLimit: formData.timeLimit,
      });

      const rawText = await response.clone().text().catch(() => '');
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || data.detail?.[0]?.msg || data.detail || rawText || 'Failed to generate quiz');
      }

      if (data.message) setInfo(data.message);
      if (data.job) {
        onJobCreated?.(data.job);
        onClose();
      } else {
        throw new Error('Quiz generation did not return a job.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start quiz generation');
    } finally {
      setIsGenerating(false);
    }
  };

  const body = (
    <>
      <div className="border-b border-border bg-muted/30 px-5 py-5 md:px-8 md:py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground md:text-2xl">New Quiz</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{steps[stepIndex]}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          {steps.map((step, index) => (
            <div key={step}>
              <div className={`h-1.5 rounded-full ${index <= stepIndex ? 'bg-primary' : 'bg-muted'}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background/50 px-5 py-6 md:px-8 md:py-7">
        {info ? (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm font-medium text-primary">{info}</div>
        ) : null}
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-600/30 dark:bg-red-900/10 dark:text-[#dc2626]">{error}</div>
        ) : null}

        {stepIndex === 0 ? (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="space-y-2">
              <label htmlFor="quiz-course" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Course</label>
              <select id="quiz-course" value={formData.courseCode} onChange={(event) => handleCourseSelect(event.target.value)} className={inputClass}>
                <option value="">Choose a course</option>
                {courses.map((course) => (
                  <option key={course.courseCode} value={course.courseCode}>
                    {course.courseCode} - {course.courseTitle} (Level {course.level})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="quiz-topic" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Topic</label>
              <Combobox value={formData.topic} onChange={(value) => { updateField('topic', value || ''); setShowAllTopics(false); }}>
                <div className="relative">
                  <div className="flex items-center rounded-xl border border-border bg-input-background px-4 py-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    <Combobox.Input
                      id="quiz-topic"
                      className="w-full border-none bg-transparent p-0 text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-0 md:text-sm"
                      displayValue={(topic: string) => topic}
                      onChange={(event) => { updateField('topic', event.target.value); setShowAllTopics(false); }}
                      onFocus={() => setShowAllTopics(true)}
                      onClick={() => setShowAllTopics(true)}
                      placeholder="Leave blank for a general course quiz"
                      autoComplete="off"
                    />
                    <Combobox.Button className="ml-2">
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </Combobox.Button>
                  </div>
                  {!(documentsLoading && !documentsLoaded) && (showAllTopics || filteredTopics.length > 0) ? (
                    <Combobox.Options className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-card py-1 text-sm shadow-lg">
                      {filteredTopics.map((topic) => (
                        <Combobox.Option key={topic} value={topic} className={({ active }) => `cursor-pointer px-3 py-2 ${active ? 'bg-muted text-foreground' : 'text-foreground/90'}`}>
                          {topic}
                        </Combobox.Option>
                      ))}
                    </Combobox.Options>
                  ) : formData.courseCode ? (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">No topics found for this course</div>
                  ) : null}
                </div>
              </Combobox>
            </div>

          </div>
        ) : null}

        {stepIndex === 1 ? (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="space-y-2">
              <label htmlFor="quiz-count" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Number of questions</label>
              <select id="quiz-count" value={formData.numQuestions} onChange={(event) => updateField('numQuestions', Number(event.target.value))} className={inputClass}>
                {[5, 10, 15, 20, 25].map((count) => (
                  <option key={count} value={count}>{count} Questions</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="quiz-type" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Question type</label>
              <select id="quiz-type" value={formData.questionType} onChange={(event) => updateField('questionType', event.target.value as QuizFormData['questionType'])} className={inputClass}>
                <option value="OBJECTIVE">Objective Questions</option>
                <option value="MCQ">Multiple Choice (3 True, 2 False)</option>
                <option value="TRUE_FALSE">True/False</option>
                <option value="SHORT_ANSWER">Short Answer</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="quiz-difficulty" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Difficulty</label>
              <select id="quiz-difficulty" value={formData.difficulty} onChange={(event) => updateField('difficulty', event.target.value as QuizFormData['difficulty'])} className={inputClass}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
        ) : null}

        {stepIndex === 2 ? (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="space-y-2">
              <label htmlFor="quiz-time" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Time limit</label>
              <select
                id="quiz-time"
                value={formData.timeLimit || ''}
                onChange={(event) => updateField('timeLimit', event.target.value ? Number(event.target.value) : undefined)}
                className={inputClass}
              >
                <option value="">No time limit</option>
                {[5, 10, 15, 20, 30, 45, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes === 60 ? '1 hour' : `${minutes} minutes`}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
              <p className="text-sm font-semibold text-foreground">Ready to generate your quiz?</p>
              <dl className="mt-3 space-y-2 text-sm text-muted-foreground">
                <div className="flex justify-between gap-3"><dt>Course</dt><dd className="text-right text-foreground">{formData.courseCode || 'Not selected'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Topic</dt><dd className="text-right text-foreground">{formData.topic || 'General'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Questions</dt><dd className="text-right text-foreground">{formData.numQuestions}</dd></div>
                <div className="flex justify-between gap-3"><dt>Difficulty</dt><dd className="text-right text-foreground capitalize">{formData.difficulty}</dd></div>
                <div className="flex justify-between gap-3"><dt>Time</dt><dd className="text-right text-foreground">{formData.timeLimit ? `${formData.timeLimit} minutes` : 'No limit'}</dd></div>
              </dl>
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border bg-muted/30 p-5 md:px-8 md:py-6">
        <div className="flex items-center gap-2">
          {stepIndex > 0 ? (
            <button type="button" onClick={() => setStepIndex((current) => current - 1)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          ) : null}
          {stepIndex < steps.length - 1 ? (
            <button
              type="button"
              disabled={!canContinue()}
              onClick={() => setStepIndex((current) => current + 1)}
              className="inline-flex min-h-11 flex-[2] items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={isGenerating || !canContinue()}
              onClick={() => void handleGenerate()}
              className="inline-flex min-h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : <Sparkles className="h-4 w-4" />}
              Generate quiz
            </button>
          )}
        </div>
      </div>
    </>
  );

  if (!isOpen) return null;

  return (
    <>
      <MobileBottomSheet isOpen={isOpen} onClose={onClose} maxHeight="95dvh" borderless>
        <div className="flex h-[calc(95dvh-24px)] max-h-[calc(95dvh-24px)] flex-col bg-card">{body}</div>
      </MobileBottomSheet>

      <div className="hidden md:block">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="flex h-[min(538px,90vh)] w-full max-w-[571px] flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              {body}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

    </>
  );
}
