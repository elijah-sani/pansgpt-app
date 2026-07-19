'use client';

// [LEARN MODE UI]

import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { 
  Loader2, 
  ChevronLeft, 
  BookOpen, 
  Check, 
  X, 
  ArrowRight,
  Sparkles,
  Award,
  AlertTriangle,
  HelpCircle
} from 'lucide-react';

interface Question {
  question_text: string;
  options: Record<string, string>;
  correct_answer: string;
  explanation: string;
  is_retest?: boolean;
  origin_section_index?: number;
}

interface SectionProgressItem {
  section_index: number;
  title: string;
  page_start: number | null;
  page_end: number | null;
  status: 'not_started' | 'in_progress' | 'needs_review' | 'mastered';
  last_score: number | null;
}

interface SectionDetailResponse {
  section_index: number;
  title: string;
  summary: string;
  page_start: number | null;
  page_end: number | null;
  explanation: string;
  check_questions: Question[];
  status: string;
  last_score: number | null;
}

interface AnswerResponse {
  correct: boolean;
  correct_answer: string;
  explanation: string;
  followup_feedback?: string | null;
  immediate_retest_question?: Question | null;
}

interface LearnModeViewProps {
  documentId: string;
  onJumpToSource: (source: { page: number; rect?: any }) => void;
  onClose?: () => void;
}

export default function LearnModeView({ documentId, onJumpToSource, onClose }: LearnModeViewProps) {
  const [view, setView] = useState<'loading' | 'start' | 'list' | 'detail'>('loading');
  const [sections, setSections] = useState<SectionProgressItem[]>([]);
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(null);
  const [sectionDetail, setSectionDetail] = useState<SectionDetailResponse | null>(null);
  
  // Question answering state
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [gradedResults, setGradedResults] = useState<Record<number, AnswerResponse>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingIndex, setSubmittingIndex] = useState<number | null>(null);
  const [scoreMessage, setScoreMessage] = useState<{ score: number; passed: boolean } | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  // Immediate retests appended dynamically
  const [extraRetests, setExtraRetests] = useState<Question[]>([]);

  // Page tracking to prevent redundant auto-navigation
  const lastNavigatedPageRef = useRef<number | null>(null);

  // Load initial progress and verify start status
  useEffect(() => {
    fetchSectionsList();
  }, [documentId]);

  const fetchSectionsList = async () => {
    try {
      setView('loading');
      const res = await api.get(`/api/learn/documents/${documentId}/sections`);
      if (res.ok) {
        const data = await res.json();
        setSections(data.sections || []);
        
        // If all sections are not started, show the pre-check start view
        const hasAnyProgress = data.sections.some((s: any) => s.status !== 'not_started');
        if (!hasAnyProgress) {
          setView('start');
        } else {
          setView('list');
        }
      } else {
        // Assume first-visit start is required if backend returns 404 or sections not initialized
        setView('start');
      }
    } catch (err) {
      console.error('[LEARN MODE UI] Error fetching sections:', err);
      setView('list');
    }
  };

  const handleStartLearn = async (confidence: string) => {
    try {
      setView('loading');
      const startRes = await api.post(`/api/learn/documents/${documentId}/start`, { confidence });
      if (startRes.ok) {
        // Reload list now initialized
        const res = await api.get(`/api/learn/documents/${documentId}/sections`);
        if (res.ok) {
          const data = await res.json();
          setSections(data.sections || []);
        }
        setView('list');
      } else {
        setView('list');
      }
    } catch (err) {
      console.error('[LEARN MODE UI] Error starting learn session:', err);
      setView('list');
    }
  };

  const handleOpenSection = async (index: number) => {
    try {
      setView('loading');
      setActiveSectionIndex(index);
      setSelectedAnswers({});
      setGradedResults({});
      setScoreMessage(null);
      setExtraRetests([]);

      const res = await api.get(`/api/learn/documents/${documentId}/sections/${index}`);
      if (res.ok) {
        const data: SectionDetailResponse = await res.json();
        setSectionDetail(data);
        setView('detail');

        // Auto-navigate document viewer to page_start on load
        if (data.page_start && lastNavigatedPageRef.current !== data.page_start) {
          lastNavigatedPageRef.current = data.page_start;
          onJumpToSource({ page: data.page_start });
        }
      } else {
        setView('list');
      }
    } catch (err) {
      console.error('[LEARN MODE UI] Error fetching section detail:', err);
      setView('list');
    }
  };

  const handleAnswerSelect = (qIdx: number, option: string) => {
    if (isSubmitting || gradedResults[qIdx]) return;
    setSelectedAnswers(prev => ({
      ...prev,
      [qIdx]: option
    }));
  };

  const handleSubmitSectionAnswers = async () => {
    if (!sectionDetail) return;
    setIsSubmitting(true);
    setScoreMessage(null);

    const questions = [...(sectionDetail.check_questions || []), ...extraRetests];
    const newGradedResults = { ...gradedResults };
    let correctCount = 0;
    let newPendingRetests: Question[] = [];

    // Grade each question sequentially
    for (let i = 0; i < questions.length; i++) {
      if (gradedResults[i]) {
        if (gradedResults[i].correct) correctCount++;
        continue; // Skip already answered questions
      }

      const selected = selectedAnswers[i];
      if (!selected) continue;

      setSubmittingIndex(i);
      try {
        const res = await api.post(`/api/learn/documents/${documentId}/sections/${activeSectionIndex}/answer`, {
          question_index: i,
          selected_option: selected
        });

        if (res.ok) {
          const grading: AnswerResponse = await res.json();
          newGradedResults[i] = grading;
          if (grading.correct) {
            correctCount++;
          }
          // If a retest question is generated instantly (e.g. final section immediate retests)
          if (grading.immediate_retest_question) {
            newPendingRetests.push(grading.immediate_retest_question);
          }
        }
      } catch (err) {
        console.error(`[LEARN MODE UI] Error grading question ${i}:`, err);
      }
    }

    setGradedResults(newGradedResults);
    setSubmittingIndex(null);
    setIsSubmitting(false);

    // Append any immediate retest questions to current view questions list
    if (newPendingRetests.length > 0) {
      setExtraRetests(prev => [...prev, ...newPendingRetests]);
      return; // Stop and let student answer the newly injected immediate retests
    }

    // Determine final score percentage
    const finalScore = Math.round((correctCount / questions.length) * 100);
    setScoreMessage({
      score: finalScore,
      passed: finalScore >= 70
    });
  };

  const handleCompleteSection = async () => {
    if (activeSectionIndex === null || !scoreMessage) return;
    setIsCompleting(true);
    try {
      const res = await api.post(`/api/learn/documents/${documentId}/sections/${activeSectionIndex}/complete`, {
        score: scoreMessage.score
      });
      if (res.ok) {
        // Back to list, reload progress statuses
        await fetchSectionsList();
      }
    } catch (err) {
      console.error('[LEARN MODE UI] Error completing section:', err);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleNextSection = async () => {
    if (activeSectionIndex === null || !scoreMessage) return;
    setIsCompleting(true);
    try {
      // First, complete current section progress
      await api.post(`/api/learn/documents/${documentId}/sections/${activeSectionIndex}/complete`, {
        score: scoreMessage.score
      });

      // Reload list in background
      const listRes = await api.get(`/api/learn/documents/${documentId}/sections`);
      if (listRes.ok) {
        const listData = await listRes.json();
        setSections(listData.sections || []);
      }

      // Automatically jump to next section
      const nextIndex = activeSectionIndex + 1;
      const nextSec = sections.find(s => s.section_index === nextIndex);
      if (nextSec) {
        await handleOpenSection(nextIndex);
      } else {
        setView('list');
      }
    } catch (err) {
      console.error('[LEARN MODE UI] Error advancing to next section:', err);
      setView('list');
    } finally {
      setIsCompleting(false);
    }
  };

  // ---------------------------------------------------------
  // Render sub-views
  // ---------------------------------------------------------

  if (view === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6 animate-pulse">
        <div className="relative">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <Sparkles className="w-5 h-5 text-primary absolute -top-1 -right-1 animate-bounce" />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Generating study material...</h3>
          <p className="text-xs text-muted-foreground max-w-[280px]">
            Please wait as we analyze the document sections to produce explanations and customized challenge questions.
          </p>
        </div>
      </div>
    );
  }

  if (view === 'start') {
    return (
      <div className="flex flex-col h-full bg-background overflow-y-auto px-6 py-8 justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Learn Mode</h2>
              <p className="text-xs text-muted-foreground">Interactive guided study guides & quizzes</p>
            </div>
          </div>

          <div className="border border-border rounded-xl p-5 bg-card shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-foreground">Familiarity check</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              How well do you already know this material? We will initialize your study pathway based on this input.
            </p>

            <div className="space-y-3 pt-2">
              <button 
                onClick={() => handleStartLearn('new')}
                className="w-full text-left p-4 rounded-xl border border-border bg-background hover:bg-muted/40 hover:border-primary/50 transition-all flex items-center justify-between group"
              >
                <div>
                  <h4 className="text-xs font-bold text-foreground">New to it</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">I am studying this topic for the very first time.</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              <button 
                onClick={() => handleStartLearn('familiar')}
                className="w-full text-left p-4 rounded-xl border border-border bg-background hover:bg-muted/40 hover:border-primary/50 transition-all flex items-center justify-between group"
              >
                <div>
                  <h4 className="text-xs font-bold text-foreground">Somewhat familiar</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">I have read through it but need concept reinforcement.</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              <button 
                onClick={() => handleStartLearn('confident')}
                className="w-full text-left p-4 rounded-xl border border-border bg-background hover:bg-muted/40 hover:border-primary/50 transition-all flex items-center justify-between group"
              >
                <div>
                  <h4 className="text-xs font-bold text-foreground">Confident</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">I know the basics and want to test my retrieval strength.</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            </div>
          </div>
        </div>

        {onClose && (
          <button 
            onClick={onClose}
            className="w-full mt-6 py-2.5 text-xs text-muted-foreground border border-border rounded-lg hover:bg-muted/30 transition-all"
          >
            Close Learn Mode
          </button>
        )}
      </div>
    );
  }

  if (view === 'list') {
    return (
      <div className="flex flex-col h-full bg-background overflow-y-auto px-5 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Study Sections</h2>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-3">
          {sections.map((sec) => {
            const statusConfig = {
              not_started: { label: 'Not Started', badge: 'bg-muted/80 text-muted-foreground border-transparent' },
              in_progress: { label: 'In Progress', badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
              needs_review: { label: 'Needs Review', badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
              mastered: { label: 'Mastered', badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' }
            }[sec.status] || { label: sec.status, badge: 'bg-muted text-muted-foreground border-transparent' };

            return (
              <button
                key={sec.section_index}
                onClick={() => handleOpenSection(sec.section_index)}
                className="w-full text-left p-4 bg-card border border-border hover:border-primary/40 rounded-xl transition-all shadow-sm flex items-center justify-between group"
              >
                <div className="space-y-1.5 min-w-0 pr-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-primary/80 uppercase">Section {sec.section_index + 1}</span>
                    <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${statusConfig.badge}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-foreground truncate">{sec.title}</h4>
                  {sec.page_start && (
                    <p className="text-[10px] text-muted-foreground">
                      Pages {sec.page_start}–{sec.page_end}
                    </p>
                  )}
                </div>
                <div className="p-1.5 bg-muted/50 rounded-lg group-hover:bg-primary/10 group-hover:text-primary transition-all shrink-0">
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // View detail rendering (explanations & inline MCQ check questions)
  // ---------------------------------------------------------

  const allQuestions = [...(sectionDetail?.check_questions || []), ...extraRetests];
  const allAnswered = allQuestions.every((_, i) => selectedAnswers[i] !== undefined);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button
          onClick={() => setView('list')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to list
        </button>
        <span className="text-[10px] font-bold text-muted-foreground uppercase">
          Section {activeSectionIndex! + 1} / {sections.length}
        </span>
      </div>

      {/* Main detail content area */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground leading-tight">{sectionDetail?.title}</h2>
          {sectionDetail?.page_start && (
            <p className="text-xs text-muted-foreground font-medium">
              Source: Pages {sectionDetail.page_start}–{sectionDetail.page_end}
            </p>
          )}
        </div>

        {/* Markdown explanation */}
        <div className="prose prose-sm dark:prose-invert max-w-full text-foreground border-b border-border/50 pb-6 leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeRaw, rehypeKatex]}
            components={{
              table: ({ node, ...props }) => (
                <div className="my-3 w-full overflow-hidden overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full m-0 border-collapse text-xs text-left border-hidden" {...props} />
                </div>
              ),
              thead: ({ node, ...props }) => <thead className="bg-muted text-foreground" {...props} />,
              th: ({ node, ...props }) => <th className="px-3 py-3 border border-border/70 font-semibold" {...props} />,
              td: ({ node, ...props }) => <td className="px-3 py-2 border border-border/50 align-top text-foreground" {...props} />,
              tr: ({ node, ...props }) => <tr className="hover:bg-muted/30 transition-colors" {...props} />
            }}
          >
            {sectionDetail?.explanation || ''}
          </ReactMarkdown>
        </div>

        {/* Challenge Section */}
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Check Your Understanding</h3>
          </div>

          <div className="space-y-6">
            {allQuestions.map((q, qIdx) => {
              const selected = selectedAnswers[qIdx];
              const grading = gradedResults[qIdx];
              const isRetest = q.is_retest;

              return (
                <div 
                  key={qIdx} 
                  className={`p-4 rounded-xl border transition-all ${
                    grading 
                      ? grading.correct 
                        ? 'border-emerald-500/30 bg-emerald-500/5' 
                        : 'border-destructive/30 bg-destructive/5'
                      : 'border-border bg-card'
                  }`}
                >
                  {/* Retest indicator badge */}
                  {isRetest && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-[9px] font-bold text-amber-500 uppercase tracking-wide mb-3">
                      Revisiting Section {q.origin_section_index! + 1}
                    </span>
                  )}

                  <div className="flex gap-2">
                    <span className="text-xs font-bold text-primary shrink-0">Q{qIdx + 1}.</span>
                    <h4 className="text-xs font-semibold text-foreground leading-tight">{q.question_text}</h4>
                  </div>

                  {/* Radio options stack */}
                  <div className="mt-3.5 space-y-2">
                    {Object.entries(q.options || {}).map(([key, optText]) => {
                      const isOptionSelected = selected === key;
                      const isOptionCorrect = q.correct_answer === key;
                      
                      let optBtnClass = "w-full text-left flex items-center px-4 py-2.5 rounded-lg border text-xs transition-all ";
                      let dotClass = "mr-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ";

                      if (grading) {
                        // Post-submission style
                        if (isOptionCorrect) {
                          optBtnClass += "border-emerald-500 bg-emerald-500/15 text-foreground";
                          dotClass += "border-emerald-500 bg-emerald-500";
                        } else if (isOptionSelected) {
                          optBtnClass += "border-destructive bg-destructive/15 text-foreground";
                          dotClass += "border-destructive bg-destructive";
                        } else {
                          optBtnClass += "border-border/60 bg-muted/10 text-muted-foreground/60 cursor-default";
                          dotClass += "border-muted-foreground/30 bg-transparent";
                        }
                      } else {
                        // Pre-submission style
                        if (isOptionSelected) {
                          optBtnClass += "border-primary bg-primary/10 text-foreground cursor-pointer";
                          dotClass += "border-primary bg-primary";
                        } else {
                          optBtnClass += "border-border hover:border-primary/30 hover:bg-muted/40 cursor-pointer";
                          dotClass += "border-muted-foreground bg-transparent";
                        }
                      }

                      return (
                        <button
                          key={key}
                          disabled={grading !== undefined || isSubmitting}
                          onClick={() => handleAnswerSelect(qIdx, key)}
                          className={optBtnClass}
                        >
                          <span className={dotClass}>
                            {isOptionSelected && <span className="w-1.5 h-1.5 bg-background rounded-full" />}
                          </span>
                          <span className="leading-snug">{optText}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Sequential submission indicator */}
                  {isSubmitting && submittingIndex === qIdx && (
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      Evaluating response...
                    </div>
                  )}

                  {/* Feedback explanation for incorrect answers */}
                  {grading && !grading.correct && (
                    <div className="mt-4 p-3 bg-destructive/10 border-l-2 border-destructive rounded text-[11px] leading-relaxed text-foreground space-y-2">
                      <p className="font-bold flex items-center gap-1 text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5" /> Incorrect
                      </p>
                      <p><span className="font-semibold text-foreground">Explanation:</span> {grading.explanation}</p>
                      {grading.followup_feedback && (
                        <p><span className="font-semibold text-foreground">Diagnostic Follow-up:</span> {grading.followup_feedback}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer grading panel */}
      <div className="p-4 border-t border-border bg-card shrink-0 space-y-4">
        {scoreMessage ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-xl border border-border/80 justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${scoreMessage.passed ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {scoreMessage.passed ? 'Section Mastered!' : 'Needs Review'}
                  </h4>
                  <p className="text-[10px] text-muted-foreground">Score: {scoreMessage.score}%</p>
                </div>
              </div>
              <span className={`text-xs font-bold ${scoreMessage.passed ? 'text-emerald-500' : 'text-amber-500'}`}>
                {scoreMessage.passed ? 'Passed' : 'Study Again'}
              </span>
            </div>

            <div className="flex gap-3">
              <button
                disabled={isCompleting}
                onClick={handleCompleteSection}
                className="flex-1 py-2.5 text-xs font-medium text-foreground bg-background hover:bg-muted border border-border rounded-lg transition-all"
              >
                Section List
              </button>
              <button
                disabled={isCompleting}
                onClick={handleNextSection}
                className="flex-1 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow transition-all flex items-center justify-center gap-1.5"
              >
                {isCompleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    Next Section
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            disabled={!allAnswered || isSubmitting}
            onClick={handleSubmitSectionAnswers}
            className={`w-full py-2.5 text-xs font-semibold text-center rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 ${
              allAnswered && !isSubmitting
                ? 'bg-primary text-white hover:bg-primary-hover'
                : 'bg-muted text-muted-foreground cursor-not-allowed border border-border/80'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Evaluating answers...
              </>
            ) : (
              'Submit Answers'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
