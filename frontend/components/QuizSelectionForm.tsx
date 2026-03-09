'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import QuizLoadingModal from './QuizLoadingModal';
import { useQuizCache } from '@/lib/QuizCacheContext';
import {
  AcademicCapIcon,
  BookOpenIcon,
  TagIcon,
  ClockIcon,
  QuestionMarkCircleIcon,
  ChartBarIcon,
  CheckCircleIcon,
  XMarkIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

// Add import for combobox
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
  const [session, setSession] = useState<any>(null);
  useEffect(() => { supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s)); }, []);
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [isQuizComplete, setIsQuizComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [formData, setFormData] = useState<QuizFormData>({
    courseCode: '',
    courseTitle: '',
    topic: '',
    level: '',
    numQuestions: 10,
    questionType: 'MCQ',
    difficulty: 'medium',
    timeLimit: undefined
  });
  const [topicOptions, setTopicOptions] = useState<string[]>([]);
  const [filteredTopics, setFilteredTopics] = useState<string[]>([]);
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
            setFormData(prev => ({ ...prev, level: userLevel }));
          }
        } catch { }
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

  useEffect(() => {
    if (!documentsLoaded && documents.length === 0) {
      return;
    }

    const relevantDocuments = formData.courseCode
      ? documents.filter((doc) => doc.course_code === formData.courseCode)
      : documents;

    const topics = [...new Set(
      relevantDocuments
        .map((document) => document.topic)
        .filter((topic): topic is string => Boolean(topic && topic.trim()))
    )];

    setTopicOptions(topics);
  }, [documents, documentsLoaded, formData.courseCode]);

  // Filter topics as user types
  useEffect(() => {
    if (!formData.topic || showAllTopics) {
      setFilteredTopics(topicOptions);
    } else {
      setFilteredTopics(
        topicOptions.filter(t => t.toLowerCase().includes(formData.topic.toLowerCase()))
      );
    }
  }, [formData.topic, topicOptions, showAllTopics]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value
    }));
  };

  const handleCourseSelect = (courseCode: string) => {
    if (!courseCode) {
      setFormData(prev => ({
        ...prev,
        courseCode: '',
        courseTitle: '',
        topic: ''
      }));
      return;
    }

    const course = courses.find(c => c.courseCode === courseCode);
    if (course) {
      setFormData(prev => ({
        ...prev,
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        level: course.level || prev.level,
        topic: '' // Clear topic when course changes
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

    // Create abort controller for cancellation
    const controller = new AbortController();
    setAbortController(controller);

    setIsGenerating(true);
    setShowLoadingModal(true);
    setIsQuizComplete(false);
    setError(null);
    setInfo(null);

    try {
      const response = await api.post('/api/quiz/generate', {
        courseCode: formData.courseCode,
        courseTitle: formData.courseTitle,
        topic: formData.topic,
        level: formData.level,
        numQuestions: formData.numQuestions,
        questionType: formData.questionType,
        difficulty: formData.difficulty,
        timeLimit: formData.timeLimit,
        userId: session?.user?.id!,
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Quiz Gen API Error Payload:", data);
        throw new Error(data.error || data.detail?.[0]?.msg || data.detail || 'Failed to generate quiz');
      }

      if (data.message) {
        setInfo(data.message);
      }

      // Mark quiz as complete and show 100% progress
      setIsQuizComplete(true);

      // Wait a moment for the progress bar to reach 100%, then navigate
      setTimeout(() => {
        router.push(`/quiz/${data.quiz.id}`);
      }, 1000);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Quiz generation cancelled');
      } else {
        setError(err.message || 'Failed to generate quiz');
      }
      setShowLoadingModal(false);
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const handleCloseLoadingModal = () => {
    setShowLoadingModal(false);
    setIsGenerating(false);
    setIsQuizComplete(false);
  };

  const handleCancelQuizGeneration = () => {
    if (abortController) {
      abortController.abort();
    }
    setShowLoadingModal(false);
    setIsGenerating(false);
    setIsQuizComplete(false);
    setError('Quiz generation cancelled');
  };

  return (
    <div className="backdrop-blur-sm border rounded-2xl p-8 bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
      {info && (
        <div className="mb-6 border rounded-xl p-4 flex items-center space-x-3 bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-600/30">
          <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-[#00A400]" />
          <p className="font-medium text-green-700 dark:text-[#00A400]">{info}</p>
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
          {/* Course Selection */}
          <div className="space-y-2">
            <label htmlFor="courseCode" className="flex items-center space-x-2 text-sm font-semibold text-gray-700 dark:text-white">
              <BookOpenIcon className="h-4 w-4" />
              <span>Select Course *</span>
            </label>
            <select
              id="courseCode"
              name="courseCode"
              required
              value={formData.courseCode}
              onChange={(e) => handleCourseSelect(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/50 focus:ring-2 focus:ring-green-600 dark:focus:ring-[#00A400] focus:border-transparent transition-all duration-200 bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20"
            >
              <option value="" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">Choose a course</option>
              {courses.map((course) => (
                <option key={course.courseCode} value={course.courseCode} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">
                  {course.courseCode} - {course.courseTitle} (Level {course.level})
                </option>
              ))}
            </select>
          </div>

          {/* Topic - Combobox */}
          <div className="space-y-2">
            <label htmlFor="topic" className="flex items-center space-x-2 text-sm font-semibold text-gray-700 dark:text-white">
              <TagIcon className="h-4 w-4" />
              <span>Topic (Optional)</span>
            </label>
            <Combobox value={formData.topic} onChange={value => {
              setFormData(prev => ({ ...prev, topic: value || "" }));
              setShowAllTopics(false);
            }}>
              <div className="relative">
                <div className="flex w-full items-center justify-between border rounded-xl px-4 py-3 bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20 focus-within:ring-2 focus-within:ring-green-600 dark:focus-within:ring-[#00A400] transition-all duration-200">
                  <Combobox.Input
                    className="w-full bg-transparent border-none p-0 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/50 focus:ring-0 outline-none"
                    displayValue={(topic: string) => topic}
                    onChange={e => {
                      setFormData(prev => ({ ...prev, topic: e.target.value || "" }));
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
                    <svg className="h-4 w-4 text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </Combobox.Button>
                </div>
                {documentsLoading && !documentsLoaded ? (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg className="animate-spin h-5 w-5 text-gray-400 dark:text-white/50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                ) : (showAllTopics || filteredTopics.length > 0) ? (
                  <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl py-1 text-base focus:outline-none sm:text-sm border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10">
                    {filteredTopics.map((topic) => (
                      <Combobox.Option
                        key={topic}
                        value={topic}
                        className={({ active }) =>
                          `relative cursor-pointer select-none py-2 pl-3 pr-9 transition-colors ${active ? 'text-gray-700 dark:text-white bg-green-600 dark:bg-[#00A400]' : 'text-gray-900 dark:text-white/90'}`
                        }
                      >
                        {topic}
                      </Combobox.Option>
                    ))}
                  </Combobox.Options>
                ) : formData.courseCode && !(documentsLoading && !documentsLoaded) ? (
                  <div className="absolute z-10 mt-1 w-full rounded-xl py-2 px-3 text-sm border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/60">
                    No topics found for this course
                  </div>
                ) : null}
              </div>
            </Combobox>
            <p className="text-sm text-gray-600 dark:text-white/70">
              {formData.courseCode
                ? `Topics available for ${formData.courseCode}. Leave blank for a general quiz on the course.`
                : 'Select a course first to see available topics. Leave blank for a general quiz on the course.'
              }
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Level */}
          <div className="space-y-2">
            <label htmlFor="level" className="flex items-center space-x-2 text-sm font-semibold text-gray-700 dark:text-white">
              <AcademicCapIcon className="h-4 w-4" />
              <span>Level *</span>
            </label>
            <select
              id="level"
              name="level"
              required
              value={formData.level}
              onChange={handleInputChange}
              className="w-full border rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-600 dark:focus:ring-[#00A400] focus:border-transparent transition-all duration-200 bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20"
            >
              <option value="" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">Select level</option>
              <option value="100" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">100</option>
              <option value="200" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">200</option>
              <option value="300" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">300</option>
              <option value="400" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">400</option>
              <option value="500" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">500</option>
              <option value="600" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">600</option>
            </select>
          </div>

          {/* Number of Questions */}
          <div className="space-y-2">
            <label htmlFor="numQuestions" className="flex items-center space-x-2 text-sm font-semibold text-gray-700 dark:text-white">
              <QuestionMarkCircleIcon className="h-4 w-4" />
              <span>Number of Questions *</span>
            </label>
            <select
              id="numQuestions"
              name="numQuestions"
              required
              value={formData.numQuestions}
              onChange={handleInputChange}
              className="w-full border rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/50 focus:ring-2 focus:ring-green-600 dark:focus:ring-[#00A400] focus:border-transparent transition-all duration-200 bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20"
            >
              <option value={5} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">5 Questions</option>
              <option value={10} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">10 Questions</option>
              <option value={15} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">15 Questions</option>
              <option value={20} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">20 Questions</option>
              <option value={30} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">30 Questions</option>
            </select>
          </div>

          {/* Question Type */}
          <div className="space-y-2">
            <label htmlFor="questionType" className="flex items-center space-x-2 text-sm font-semibold text-gray-700 dark:text-white">
              <ChartBarIcon className="h-4 w-4" />
              <span>Question Type *</span>
            </label>
            <select
              id="questionType"
              name="questionType"
              required
              value={formData.questionType}
              onChange={handleInputChange}
              className="w-full border rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/50 focus:ring-2 focus:ring-green-600 dark:focus:ring-[#00A400] focus:border-transparent transition-all duration-200 bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20"
            >
              <option value="OBJECTIVE" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">Objective Questions</option>
              <option value="MCQ" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">Multiple Choice Questions</option>
              <option value="TRUE_FALSE" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">True/False</option>
              <option value="SHORT_ANSWER" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">Short Answer</option>
            </select>
          </div>

          {/* Difficulty */}
          <div className="space-y-2">
            <label htmlFor="difficulty" className="flex items-center space-x-2 text-sm font-semibold text-gray-700 dark:text-white">
              <ChartBarIcon className="h-4 w-4" />
              <span>Difficulty Level *</span>
            </label>
            <select
              id="difficulty"
              name="difficulty"
              required
              value={formData.difficulty}
              onChange={handleInputChange}
              className="w-full border rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/50 focus:ring-2 focus:ring-green-600 dark:focus:ring-[#00A400] focus:border-transparent transition-all duration-200 bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20"
            >
              <option value="easy" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">Easy</option>
              <option value="medium" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">Medium</option>
              <option value="hard" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">Hard</option>
            </select>
          </div>

          {/* Time Limit */}
          <div className="space-y-2">
            <label htmlFor="timeLimit" className="flex items-center space-x-2 text-sm font-semibold text-gray-700 dark:text-white">
              <ClockIcon className="h-4 w-4" />
              <span>Time Limit (Optional)</span>
            </label>
            <select
              id="timeLimit"
              name="timeLimit"
              value={formData.timeLimit || ''}
              onChange={handleInputChange}
              className="w-full border rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/50 focus:ring-2 focus:ring-green-600 dark:focus:ring-[#00A400] focus:border-transparent transition-all duration-200 bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20"
            >
              <option value="" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">No time limit</option>
              <option value={5} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">5 minutes</option>
              <option value={10} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">10 minutes</option>
              <option value={15} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">15 minutes</option>
              <option value={20} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">20 minutes</option>
              <option value={30} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">30 minutes</option>
              <option value={45} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">45 minutes</option>
              <option value={60} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">1 hour</option>
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-6 border-t border-gray-200 dark:border-white/10">
          <button
            type="submit"
            disabled={isGenerating}
            className="w-full flex items-center justify-center space-x-2 px-8 py-4 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#008300]"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Generating Quiz...</span>
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

      {/* Loading Modal */}
      <QuizLoadingModal
        isOpen={showLoadingModal}
        onClose={handleCloseLoadingModal}
        onCancel={handleCancelQuizGeneration}
        isComplete={isQuizComplete}
      />
    </div>
  );
} 
