'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useQuizCache } from '@/lib/QuizCacheContext';
import {
  CheckCircleIcon,
  XMarkIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { Combobox } from '@headlessui/react';

interface QuizFormData {
  courseCode: string;
  courseTitle: string;
  topic: string;
  level: string;
  numQuestions: number;
  questionType: 'MCQ' | 'TRUE_FALSE' | 'OBJECTIVE' | 'SHORT_ANSWER';
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit?: number;
}

export default function QuizSelectionForm() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
  }, []);

  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [formData, setFormData] = useState<QuizFormData>({
    courseCode: '',
    courseTitle: '',
    topic: '',
    level: '',
    numQuestions: 10,
    questionType: 'OBJECTIVE',
    difficulty: 'medium',
    timeLimit: undefined,
  });

  const [showAllTopics, setShowAllTopics] = useState(false);

  const {
    courses,
    documents,
    documentsLoaded,
    documentsLoading,
    userLevel,
    userLevelLoaded,
    fetchDocuments,
    fetchUserLevel,
  } = useQuizCache();

  useEffect(() => {
    async function loadUserLevel() {
      if (!formData.level && session?.user) {
        try {
          if (!userLevelLoaded && !userLevel) {
            await fetchUserLevel();
          }
          if (userLevel) {
            setFormData((prev) => ({ ...prev, level: userLevel }));
          }
        } catch {}
      }
    }
    void loadUserLevel();
  }, [fetchUserLevel, formData.level, session, userLevel, userLevelLoaded]);

  useEffect(() => {
    if (documentsLoaded || documents.length > 0) {
      return;
    }
    void fetchDocuments().catch((error) => {
      console.error('Failed to fetch courses:', error);
    });
  }, [documents.length, documentsLoaded, fetchDocuments]);

  const topicOptions = useMemo(() => {
    if (!documentsLoaded && documents.length === 0) return [];
    const activeDocuments = documents.filter((doc) => String(doc.material_status || 'active').toLowerCase() === 'active');
    const relevantDocuments = formData.courseCode
      ? activeDocuments.filter((doc) => doc.course_code === formData.courseCode)
      : activeDocuments;
    return [
      ...new Set(
        relevantDocuments
          .map((document) => document.topic)
          .filter((topic): topic is string => Boolean(topic && topic.trim()))
      ),
    ];
  }, [documents, documentsLoaded, formData.courseCode]);

  const filteredTopics = useMemo(() => {
    if (!formData.topic || showAllTopics) return topicOptions;
    return topicOptions.filter((t) => t.toLowerCase().includes(formData.topic.toLowerCase()));
  }, [formData.topic, topicOptions, showAllTopics]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value,
    }));
  };

  const handleCourseSelect = (courseCode: string) => {
    if (!courseCode) {
      setFormData((prev) => ({ ...prev, courseCode: '', courseTitle: '', topic: '' }));
      return;
    }
    const course = courses.find((c) => c.courseCode === courseCode);
    if (course) {
      setFormData((prev) => ({
        ...prev,
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        level: course.level || prev.level,
        topic: '',
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.courseCode || !formData.courseTitle) {
      setError('Please select a course');
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
      // Use the job-based endpoint so generation runs in the background
      // and the user is taken to the real-time generating screen.
      const response = await api.post('/api/quiz/jobs', {
        courseCode: formData.courseCode,
        courseTitle: formData.courseTitle,
        topic: formData.topic,
        level: formData.level,
        numQuestions: formData.numQuestions,
        questionType: formData.questionType,
        difficulty: formData.difficulty,
        timeLimit: formData.timeLimit,
      });

      const rawText = await response.clone().text().catch(() => '');
      let data: { job?: { id?: string }; detail?: string | { msg?: string }[] } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const detail = data.detail;
        throw new Error(
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
            ? (detail[0]?.msg ?? 'Failed to start quiz generation')
            : rawText || 'Failed to start quiz generation'
        );
      }

      const jobId = data.job?.id;
      if (!jobId) {
        throw new Error('No job ID returned. Please try again.');
      }

      // Persist job ID so QuizGeneratingScreen can resume if the user refreshes.
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('pansgpt-active-quiz-job-id', jobId);
      }

      router.push(`/quiz/generating/${jobId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start quiz generation';
      setError(message);
      setIsGenerating(false);
    }
  };

  return (
    <div className="backdrop-blur-sm border rounded-2xl p-8 bg-card border-border">
      {info && (
        <div className="mb-6 border rounded-xl p-4 flex items-center space-x-3 bg-primary/10 dark:bg-primary/15 border-primary/30 dark:border-primary/30">
          <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-primary dark:text-primary" />
          <p className="font-medium text-primary dark:text-primary">{info}</p>
        </div>
      )}
      {error && (
        <div className="mb-6 border rounded-xl p-4 flex items-center space-x-3 bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-600/30">
          <XMarkIcon className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-[#dc2626]" />
          <p className="font-medium text-red-700 dark:text-[#dc2626]">{error}</p>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="courseCode" className="block text-sm font-semibold text-foreground mb-2">
              Select Course *
            </label>
            <select
              id="courseCode"
              name="courseCode"
              required
              value={formData.courseCode}
              onChange={(e) => handleCourseSelect(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary dark:focus:ring-primary focus:border-transparent transition-all duration-200 bg-input-background border-border"
            >
              <option value="" className="bg-card text-foreground">Choose a course</option>
              {courses.map((course) => (
                <option key={course.courseCode} value={course.courseCode} className="bg-card text-foreground">
                  {course.courseCode} - {course.courseTitle} (Level {course.level})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="topic" className="block text-sm font-semibold text-foreground mb-2">
              Topic (Optional)
            </label>
            <Combobox
              value={formData.topic}
              onChange={(value) => {
                setFormData((prev) => ({ ...prev, topic: value || '' }));
                setShowAllTopics(false);
              }}
            >
              <div className="relative">
                <div className="flex w-full items-center justify-between border rounded-xl px-4 py-3 bg-input-background border-border focus-within:ring-2 focus-within:ring-primary dark:focus-within:ring-primary transition-all duration-200">
                  <Combobox.Input
                    className="w-full bg-transparent border-none p-0 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:ring-0 outline-none"
                    displayValue={(topic: string) => topic}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, topic: e.target.value || '' }));
                      setShowAllTopics(false);
                    }}
                    onFocus={() => setShowAllTopics(true)}
                    onClick={() => setShowAllTopics(true)}
                    placeholder="e.g., Drug Metabolism, Titration, etc."
                    id="topic"
                    name="topic"
                    autoComplete="off"
                  />
                  <Combobox.Button className="ml-2 flex items-center bg-transparent border-none">
                    <svg className="h-4 w-4 text-muted-foreground hover:text-foreground" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </Combobox.Button>
                </div>
                {documentsLoading && !documentsLoaded ? (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg className="animate-spin h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                ) : showAllTopics || filteredTopics.length > 0 ? (
                  <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl py-1 text-base focus:outline-none sm:text-sm border bg-card border-border">
                    {filteredTopics.map((topic) => (
                      <Combobox.Option
                        key={topic}
                        value={topic}
                        className={({ active }) =>
                          `relative cursor-pointer select-none py-2 pl-3 pr-9 transition-colors ${
                            active ? 'text-foreground bg-primary dark:bg-primary' : 'text-foreground/90'
                          }`
                        }
                      >
                        {topic}
                      </Combobox.Option>
                    ))}
                  </Combobox.Options>
                ) : formData.courseCode && !(documentsLoading && !documentsLoaded) ? (
                  <div className="absolute z-10 mt-1 w-full rounded-xl py-2 px-3 text-sm border bg-card border-border text-muted-foreground">
                    No topics found for this course
                  </div>
                ) : null}
              </div>
            </Combobox>
            <p className="text-sm text-muted-foreground">
              {formData.courseCode
                ? `Topics available for ${formData.courseCode}. Leave blank for a general quiz on the course.`
                : 'Select a course first to see available topics. Leave blank for a general quiz on the course.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label htmlFor="level" className="block text-sm font-semibold text-foreground mb-2">
              Level *
            </label>
            <select
              id="level"
              name="level"
              required
              value={formData.level}
              onChange={handleInputChange}
              className="w-full border rounded-xl px-4 py-3 text-base md:text-sm text-foreground focus:ring-2 focus:ring-primary dark:focus:ring-primary focus:border-transparent transition-all duration-200 bg-input-background border-border"
            >
              <option value="" className="bg-card text-foreground">Select level</option>
              <option value="100" className="bg-card text-foreground">100</option>
              <option value="200" className="bg-card text-foreground">200</option>
              <option value="300" className="bg-card text-foreground">300</option>
              <option value="400" className="bg-card text-foreground">400</option>
              <option value="500" className="bg-card text-foreground">500</option>
              <option value="600" className="bg-card text-foreground">600</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="numQuestions" className="block text-sm font-semibold text-foreground mb-2">
              Number of Questions *
            </label>
            <select
              id="numQuestions"
              name="numQuestions"
              required
              value={formData.numQuestions}
              onChange={handleInputChange}
              className="w-full border rounded-xl px-4 py-3 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary dark:focus:ring-primary focus:border-transparent transition-all duration-200 bg-input-background border-border"
            >
              <option value={5} className="bg-card text-foreground">5 Questions</option>
              <option value={10} className="bg-card text-foreground">10 Questions</option>
              <option value={15} className="bg-card text-foreground">15 Questions</option>
              <option value={20} className="bg-card text-foreground">20 Questions</option>
              <option value={25} className="bg-card text-foreground">25 Questions</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="questionType" className="block text-sm font-semibold text-foreground mb-2">
              Question Type *
            </label>
            <select
              id="questionType"
              name="questionType"
              required
              value={formData.questionType}
              onChange={handleInputChange}
              className="w-full border rounded-xl px-4 py-3 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary dark:focus:ring-primary focus:border-transparent transition-all duration-200 bg-input-background border-border"
            >
              <option value="OBJECTIVE" className="bg-card text-foreground">Objective Questions</option>
              <option value="MCQ" className="bg-card text-foreground">Multiple Choice (3 True, 2 False)</option>
              <option value="TRUE_FALSE" className="bg-card text-foreground">True/False</option>
              <option value="SHORT_ANSWER" className="bg-card text-foreground">Short Answer</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="difficulty" className="block text-sm font-semibold text-foreground mb-2">
              Difficulty Level *
            </label>
            <select
              id="difficulty"
              name="difficulty"
              required
              value={formData.difficulty}
              onChange={handleInputChange}
              className="w-full border rounded-xl px-4 py-3 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary dark:focus:ring-primary focus:border-transparent transition-all duration-200 bg-input-background border-border"
            >
              <option value="easy" className="bg-card text-foreground">Easy</option>
              <option value="medium" className="bg-card text-foreground">Medium</option>
              <option value="hard" className="bg-card text-foreground">Hard</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="timeLimit" className="block text-sm font-semibold text-foreground mb-2">
              Time Limit (Optional)
            </label>
            <select
              id="timeLimit"
              name="timeLimit"
              value={formData.timeLimit || ''}
              onChange={handleInputChange}
              className="w-full border rounded-xl px-4 py-3 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary dark:focus:ring-primary focus:border-transparent transition-all duration-200 bg-input-background border-border"
            >
              <option value="" className="bg-card text-foreground">No time limit</option>
              <option value={5} className="bg-card text-foreground">5 minutes</option>
              <option value={10} className="bg-card text-foreground">10 minutes</option>
              <option value={15} className="bg-card text-foreground">15 minutes</option>
              <option value={20} className="bg-card text-foreground">20 minutes</option>
              <option value={30} className="bg-card text-foreground">30 minutes</option>
              <option value={45} className="bg-card text-foreground">45 minutes</option>
              <option value={60} className="bg-card text-foreground">1 hour</option>
            </select>
          </div>
        </div>

        <div className="pt-6 border-t border-border">
          <button
            type="submit"
            disabled={isGenerating}
            className="w-full flex items-center justify-center space-x-2 px-8 py-4 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 bg-primary dark:bg-primary hover:bg-primary/90 dark:hover:bg-primary/90"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Starting Quiz Generation...</span>
              </>
            ) : (
              <>
                <SparklesIcon className="h-5 w-5" />
                <span>Generate Quiz</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
