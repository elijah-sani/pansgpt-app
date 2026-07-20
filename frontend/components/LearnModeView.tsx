'use client';

// [LEARN MODE UI]

import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase'; // [LEARN MODE UI]
import Logo from '@/components/Logo'; // [LEARN MODE UI]
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { 
  Loader2, 
  ChevronLeft,
  ChevronDown,
  BookOpen, 
  Check, 
  X, 
  ArrowRight,
  Sparkles,
  Award,
  AlertTriangle,
  HelpCircle,
  Lightbulb
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
  sections?: SectionProgressItem[]; // [LEARN MODE UI]
  onSectionsLoaded?: (sections: SectionProgressItem[]) => void; // [LEARN MODE UI]
}



export default function LearnModeView({ 
  documentId, 
  onJumpToSource, 
  onClose,
  sections: parentSections, // [LEARN MODE UI]
  onSectionsLoaded // [LEARN MODE UI]
}: LearnModeViewProps) {
  const [view, setView] = useState<'loading' | 'start' | 'list' | 'detail'>('loading');
  const [selectedConfidence, setSelectedConfidence] = useState<string | null>(null); // [LEARN MODE UI]
  const [localSections, setLocalSections] = useState<SectionProgressItem[]>([]); // [LEARN MODE UI]
  const sections = parentSections || localSections; // [LEARN MODE UI]
  const setSections = (newSections: SectionProgressItem[]) => { // [LEARN MODE UI]
    setLocalSections(newSections); // [LEARN MODE UI]
    if (onSectionsLoaded) onSectionsLoaded(newSections); // [LEARN MODE UI]
  }; // [LEARN MODE UI]
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

  // Focus Quiz Modal, Hint & Question Navigation state
  const [showQuizModal, setShowQuizModal] = useState<boolean>(false);
  const [activeHints, setActiveHints] = useState<Record<number, boolean>>({});
  const [quizQuestionIndex, setQuizQuestionIndex] = useState<number>(0);

  // Page tracking to prevent redundant auto-navigation
  const lastNavigatedPageRef = useRef<number | null>(null);

  const [studentFirstName, setStudentFirstName] = useState<string>('there'); // [LEARN MODE UI]

  // Load initial progress, verify start status and fetch student name
  useEffect(() => {
    fetchSectionsList();

    async function loadStudentName() { // [LEARN MODE UI]
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const fullName = session.user.user_metadata?.full_name || '';
          let name = fullName.trim().split(/\s+/)[0] || '';
          const res = await api.get('/me/bootstrap');
          if (res.ok) {
            const data = await res.json();
            const fetchedName = data?.profile?.first_name || data?.profile?.full_name?.trim().split(/\s+/)[0];
            if (fetchedName) {
              name = fetchedName;
            }
          }
          if (name) {
            setStudentFirstName(name);
          }
        }
      } catch (err) {
        console.error('[LEARN MODE UI] Error loading student name:', err);
      }
    }
    loadStudentName();
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
      setShowQuizModal(false);
      setActiveHints({});
      setQuizQuestionIndex(0);

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

  const handleCheckSingleAnswer = async (qIdx: number) => {
    const selected = selectedAnswers[qIdx];
    if (!selected || isSubmitting || gradedResults[qIdx] || !sectionDetail) return;

    setIsSubmitting(true);
    setSubmittingIndex(qIdx);

    try {
      const res = await api.post(`/api/learn/documents/${documentId}/sections/${activeSectionIndex}/answer`, {
        question_index: qIdx,
        selected_option: selected
      });

      if (res.ok) {
        const grading: AnswerResponse = await res.json();
        const updatedGraded = { ...gradedResults, [qIdx]: grading };
        setGradedResults(updatedGraded);

        if (grading.immediate_retest_question) {
          setExtraRetests(prev => [...prev, grading.immediate_retest_question!]);
        }

        const allQs = [...(sectionDetail.check_questions || []), ...extraRetests, ...(grading.immediate_retest_question ? [grading.immediate_retest_question] : [])];
        const gradedCount = Object.keys(updatedGraded).length;

        if (gradedCount >= allQs.length) {
          let correctCount = 0;
          allQs.forEach((_, idx) => {
            if (updatedGraded[idx]?.correct) correctCount++;
          });
          const finalScore = Math.round((correctCount / allQs.length) * 100);
          setScoreMessage({
            score: finalScore,
            passed: finalScore >= 70
          });
        }
      }
    } catch (err) {
      console.error(`[LEARN MODE UI] Error grading single question ${qIdx}:`, err);
    } finally {
      setIsSubmitting(false);
      setSubmittingIndex(null);
    }
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
    const confidenceOptions: Array<{
      key: string;
      label: string;
      sub: string;
      preview: string;
    }> = [
      {
        key: 'new',
        label: "I'm reading this for the first time",
        sub: 'Fresh start — no prior exposure.',
        preview: "We'll build your foundation from scratch, section by section.",
      },
      {
        key: 'familiar',
        label: "I've read it but it's not sticking",
        sub: 'Seen it before, but the concepts slip away.',
        preview: "We'll reinforce the gaps and deepen your recall.",
      },
      {
        key: 'confident',
        label: 'I need to test myself before an exam',
        sub: 'Know the basics — time to prove it.',
        preview: "We'll put your retrieval strength to the test immediately.",
      },
    ];

    return (
      <>
        {/* [LEARN MODE UI] Keyframe animations injected once */}
        <style>{`
          @keyframes lm-fade-up {
            from { opacity: 0; transform: translateY(18px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes lm-slide-up-cta {
            from { opacity: 0; transform: translateY(24px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes lm-shrink-out {
            from { opacity: 1; max-height: 200px; transform: scale(1); margin-bottom: 12px; }
            to   { opacity: 0; max-height: 0px; transform: scale(0.96); margin-bottom: 0; padding-top: 0; padding-bottom: 0; }
          }
          .lm-option-enter {
            animation: lm-fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both;
          }
          .lm-option-selected {
            border-color: var(--primary, #16a34a) !important;
            background: rgba(22, 163, 74, 0.06);
          }
          .lm-option-dismissed {
            animation: lm-shrink-out 0.4s cubic-bezier(0.4,0,1,1) forwards;
            animation-delay: 0.5s; /* Snappy delay: 0.5s */
            overflow: hidden;
            pointer-events: none;
          }
          .lm-cta-enter {
            animation: lm-slide-up-cta 0.4s cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: 0.8s; /* CTA appears right after cards fade out */
          }
        `}</style>

        <div className="flex flex-col h-full bg-background overflow-hidden px-6 py-8">
          {/* Centered Content Area */}
          <div className="flex-1 flex flex-col justify-center min-h-0 overflow-y-auto py-4">
            <div className="max-w-md w-full mx-auto space-y-6">
              {/* Logo and Greeting + Question prompt group — positioned close together and left-aligned */}
              <div className="space-y-4 lm-option-enter" style={{ animationDelay: '0ms' }}>
                <div className="flex items-center gap-2">
                  <Logo className="h-6 w-6 shrink-0 text-[#2f9e1c] dark:text-[#2f9e1c]!" style={{ color: '#2f9e1c' }} />
                  <span className="text-sm font-bold text-foreground">Hi, {studentFirstName}</span>
                </div>
                <p className="text-sm font-bold text-foreground leading-snug text-left">
                  Before we start —{' '}
                  <span className="text-muted-foreground font-normal">
                    what brings you here today?
                  </span>
                </p>
              </div>

              {/* Option cards */}
              <div className="flex flex-col gap-3">
                {confidenceOptions.map((opt, i) => {
                  const isSelected = selectedConfidence === opt.key;
                  const isDismissed =
                    selectedConfidence !== null && selectedConfidence !== opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setSelectedConfidence(opt.key)}
                      className={[
                        'lm-option-enter w-full text-left p-4 rounded-xl border transition-colors duration-200',
                        'border-border bg-card focus:outline-none',
                        isSelected ? 'lm-option-selected' : 'hover:border-primary/40 hover:bg-muted/30',
                        isDismissed ? 'lm-option-dismissed' : '',
                      ].join(' ')}
                      style={{ animationDelay: `${100 + i * 90}ms` }}
                    >
                      <div className="flex items-center gap-3.5">
                        {/* Radio circle — vertically centered */}
                        <div className="shrink-0 flex items-center justify-center">
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                            isSelected ? 'border-primary bg-primary/10' : 'border-border bg-card'
                          }`}>
                            {isSelected && (
                              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                            )}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-foreground leading-snug">
                            {opt.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{opt.sub}</p>
                          {isSelected && (
                            <p
                              className="text-[11px] text-primary font-medium mt-2 lm-option-enter"
                              style={{ animationDelay: '0ms' }}
                            >
                              ✦ {opt.preview}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* CTA + Back Button — only appears after selection */}
              {selectedConfidence && (
                <div className="mt-6 lm-cta-enter flex items-center gap-3">
                  <button
                    onClick={() => setSelectedConfidence(null)}
                    className="flex-1 py-3.5 rounded-xl border border-border bg-card hover:bg-muted/40 text-foreground text-sm font-semibold transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      if (selectedConfidence) handleStartLearn(selectedConfidence);
                    }}
                    className="flex-[2] py-3.5 rounded-xl bg-primary hover:opacity-90 active:opacity-95 text-primary-foreground text-sm font-bold transition-all shadow-md shadow-primary/20"
                  >
                    Start Learning →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (view === 'list') {
    const masteredCount = sections.filter(s => s.status === 'mastered').length;
    const totalCount = sections.length;
    const progressPct = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;

    return (
      <div className="flex flex-col h-full bg-background overflow-y-auto px-4 py-5">
        {/* ── Top Progress Stat Bar (No Header Title/X) ──────────────────── */}
        {totalCount > 0 && (
          <div className="mb-5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
              <span>{masteredCount} of {totalCount} sections mastered</span>
              <span className="text-primary font-bold">{progressPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Flat Rows Container (Inspired by target image) ─────────────── */}
        <div className="divide-y divide-border/40 border-t border-b border-border/40">
          {sections.map((sec, i) => {
            const pct = sec.last_score !== null ? `${sec.last_score}%` : '0%';
            const isMastered = sec.status === 'mastered';
            const isNeedsReview = sec.status === 'needs_review';
            const isInProgress = sec.status === 'in_progress';

            const scoreBadgeStyle = isMastered
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
              : isNeedsReview
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
              : isInProgress
              ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
              : 'border-border/60 bg-muted/30 text-muted-foreground';

            return (
              <div key={sec.section_index} className="lm-row-enter" style={{ animationDelay: `${i * 30}ms` }}>
                <div
                  onClick={() => handleOpenSection(sec.section_index)}
                  className="w-full text-left py-3.5 px-3 flex items-center justify-between gap-3 hover:bg-muted/20 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="text-xs font-semibold text-muted-foreground/60 w-5 shrink-0 text-center">
                      {sec.section_index + 1}
                    </span>
                    <h4 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {sec.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${scoreBadgeStyle}`}>
                      {pct}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {sections.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
            <BookOpen className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground">No sections found</p>
          </div>
        )}

        <style>{`
          @keyframes lm-row-in {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0);   }
          }
          .lm-row-enter {
            animation: lm-row-in 0.2s ease-out both;
          }
        `}</style>
      </div>
    );
  }

  // ---------------------------------------------------------
  // View detail rendering (explanations & inline MCQ check questions)
  // ---------------------------------------------------------

  const allQuestions = [...(sectionDetail?.check_questions || []), ...extraRetests];
  const allAnswered = allQuestions.every((_, i) => selectedAnswers[i] !== undefined);

  return (
    <>
      {/* ── Sidebar Section View ────────────────────────────────────────── */}
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

          {/* Active Recall Quiz CTA Container */}
          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3 shadow-sm">
            <div className="flex items-center gap-2 text-primary font-bold text-xs">
              <Sparkles className="w-4 h-4" />
              <span>Closed-Book Active Recall</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Test your retrieval strength without peeking at the source text. Complete the section check quiz to unlock mastery.
            </p>

            {scoreMessage ? (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <Award className={`w-4 h-4 ${scoreMessage.passed ? 'text-emerald-500' : 'text-amber-500'}`} />
                    <span className="text-xs font-bold text-foreground">
                      {scoreMessage.passed ? 'Section Mastered' : 'Needs Review'} ({scoreMessage.score}%)
                    </span>
                  </div>
                  <button
                    onClick={() => setShowQuizModal(true)}
                    className="text-[11px] font-semibold text-primary hover:underline"
                  >
                    View Quiz Results
                  </button>
                </div>
                <button
                  disabled={isCompleting}
                  onClick={handleNextSection}
                  className="w-full py-3 px-4 rounded-xl bg-primary hover:opacity-90 active:opacity-95 text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 flex items-center justify-center gap-2 transition-all"
                >
                  {isCompleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Next Section
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowQuizModal(true)}
                className="w-full py-3 px-4 rounded-xl bg-primary hover:opacity-90 active:opacity-95 text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 flex items-center justify-center gap-2 transition-all"
              >
                Test My Knowledge →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Focus Quiz Modal Overlay (Closed-Book Mode: Single Question Flow) ── */}
      {showQuizModal && allQuestions.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-2xl max-h-[90vh] bg-card border border-border/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
            
            {/* Modal Header Bar */}
            <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between bg-card/60">
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                  Section {activeSectionIndex! + 1} Quiz • Closed-Book Recall
                </span>
                <h3 className="text-sm font-bold text-foreground truncate max-w-md">
                  {sectionDetail?.title}
                </h3>
              </div>
              <button
                onClick={() => setShowQuizModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Pause Quiz"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Progress Indicator */}
            <div className="px-6 py-2.5 bg-muted/30 border-b border-border/40 flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>
                Question {quizQuestionIndex + 1} of {allQuestions.length}
              </span>
              <span>
                {Math.round(((quizQuestionIndex + 1) / allQuestions.length) * 100)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${((quizQuestionIndex + 1) / allQuestions.length) * 100}%` }}
              />
            </div>

            {/* Questions Body Area */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {scoreMessage ? (
                /* Completion Result Card */
                <div className="py-6 space-y-6 text-center">
                  <div className="inline-flex p-4 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
                    <Award className="w-10 h-10" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-foreground">
                      {scoreMessage.passed ? 'Section Mastered!' : 'Needs Review'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      You scored <strong className="text-primary">{scoreMessage.score}%</strong> on this recall quiz.
                    </p>
                  </div>
                </div>
              ) : (
                /* Single Question Display */
                (() => {
                  const q = allQuestions[quizQuestionIndex] || allQuestions[0];
                  const qIdx = quizQuestionIndex;
                  const selected = selectedAnswers[qIdx];
                  const grading = gradedResults[qIdx];
                  const isRetest = q.is_retest;
                  const isHintOpen = !!activeHints[qIdx];

                  return (
                    <div className="space-y-5">
                      {isRetest && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-[9px] font-bold text-amber-500 uppercase tracking-wide">
                          Revisiting Section {q.origin_section_index! + 1}
                        </span>
                      )}

                      {/* Question Stem */}
                      <p className="text-base font-semibold leading-relaxed text-foreground md:text-lg">
                        {q.question_text}
                      </p>

                      {/* Option Stack (A. B. C. D. styling matching QuizTaking.tsx) */}
                      <div className="space-y-3 mt-4">
                        {Object.entries(q.options || {}).map(([key, optText], optIdx) => {
                          const isOptionSelected = selected === key;
                          const isOptionCorrect = q.correct_answer === key;
                          const letterLabel = String.fromCharCode(65 + optIdx); // A, B, C, D

                          let optBtnClass = "w-full text-left flex items-center px-4 py-3.5 rounded-xl border text-sm font-medium transition-all min-h-[3.2rem] ";

                          if (grading) {
                            if (isOptionCorrect) {
                              optBtnClass += "border-emerald-500 bg-emerald-500/15 text-foreground font-semibold";
                            } else if (isOptionSelected) {
                              optBtnClass += "border-destructive bg-destructive/15 text-foreground";
                            } else {
                              optBtnClass += "border-border/50 bg-muted/10 text-muted-foreground/50 cursor-default";
                            }
                          } else {
                            if (isOptionSelected) {
                              optBtnClass += "border-primary bg-primary/10 text-foreground shadow-sm cursor-pointer";
                            } else {
                              optBtnClass += "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/30 cursor-pointer";
                            }
                          }

                          return (
                            <button
                              key={key}
                              disabled={grading !== undefined || isSubmitting}
                              onClick={() => handleAnswerSelect(qIdx, key)}
                              className={optBtnClass}
                            >
                              <span className="mr-3 font-bold text-primary shrink-0">{letterLabel}.</span>
                              <span className="leading-snug">{optText}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* 💡 HINT Toggle */}
                      {!grading && (
                        <div className="pt-2">
                          <button
                            onClick={() => setActiveHints(prev => ({ ...prev, [qIdx]: !prev[qIdx] }))}
                            className="inline-flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 font-medium transition-colors"
                          >
                            <Lightbulb className="w-3.5 h-3.5" />
                            {isHintOpen ? 'Hide Hint' : 'Need a hint?'}
                          </button>
                          {isHintOpen && (
                            <div className="mt-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 leading-relaxed animate-in fade-in duration-200">
                              💡 <strong>Hint:</strong> Focus on the core concepts and key terms presented in this section explanation.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Feedback Badges & Detailed AI Explanation (Retains original sidebar behavior for BOTH Correct & Incorrect) */}
                      {grading && (
                        <div className={`mt-4 p-4 border-l-4 rounded-xl text-xs leading-relaxed space-y-2.5 animate-in fade-in duration-200 ${
                          grading.correct 
                            ? 'bg-emerald-500/10 border-emerald-500 text-foreground' 
                            : 'bg-destructive/10 border-destructive text-foreground'
                        }`}>
                          <div className="flex items-center gap-1.5 font-bold">
                            {grading.correct ? (
                              <span className="text-emerald-500 flex items-center gap-1">
                                <CheckCircle className="w-4 h-4" /> Correct!
                              </span>
                            ) : (
                              <span className="text-destructive flex items-center gap-1">
                                <AlertTriangle className="w-4 h-4" /> Incorrect
                              </span>
                            )}
                          </div>
                          
                          {grading.explanation && (
                            <p><span className="font-semibold text-foreground">Explanation:</span> {grading.explanation}</p>
                          )}

                          {grading.followup_feedback && (
                            <p className="pt-1 border-t border-border/40">
                              <span className="font-semibold text-foreground">Diagnostic Follow-up:</span> {grading.followup_feedback}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-5 border-t border-border bg-card/90 shrink-0">
              {scoreMessage ? (
                <div className="flex gap-3">
                  <button
                    disabled={isCompleting}
                    onClick={() => {
                      setShowQuizModal(false);
                      handleCompleteSection();
                    }}
                    className="flex-1 py-3 text-xs font-semibold text-foreground bg-background hover:bg-muted border border-border rounded-xl transition-all"
                  >
                    Section List
                  </button>
                  <button
                    disabled={isCompleting}
                    onClick={() => {
                      setShowQuizModal(false);
                      handleNextSection();
                    }}
                    className="flex-1 py-3 text-xs font-bold text-primary-foreground bg-primary hover:opacity-90 rounded-xl shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-1.5"
                  >
                    {isCompleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Continue to Next Section
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <button
                    disabled={quizQuestionIndex === 0}
                    onClick={() => setQuizQuestionIndex(i => Math.max(0, i - 1))}
                    className="px-5 py-3 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>

                  {/* Main Action Button for current question */}
                  {(() => {
                    const qIdx = quizQuestionIndex;
                    const selected = selectedAnswers[qIdx];
                    const grading = gradedResults[qIdx];

                    if (!grading) {
                      // Question not evaluated yet -> Show "Check Answer" button
                      return (
                        <button
                          disabled={!selected || isSubmitting}
                          onClick={() => handleCheckSingleAnswer(qIdx)}
                          className={`px-7 py-3 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 ${
                            selected && !isSubmitting
                              ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-primary/20'
                              : 'bg-muted text-muted-foreground cursor-not-allowed border border-border/80'
                          }`}
                        >
                          {isSubmitting && submittingIndex === qIdx ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Checking Answer...
                            </>
                          ) : (
                            'Check Answer'
                          )}
                        </button>
                      );
                    }

                    // Question IS graded
                    if (qIdx < allQuestions.length - 1) {
                      return (
                        <button
                          onClick={() => setQuizQuestionIndex(i => Math.min(allQuestions.length - 1, i + 1))}
                          className="px-6 py-3 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 flex items-center gap-1.5"
                        >
                          Next Question →
                        </button>
                      );
                    }

                    // Last question and graded -> Show Finish Quiz
                    return (
                      <button
                        onClick={handleSubmitSectionAnswers}
                        disabled={isSubmitting}
                        className="px-7 py-3 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 flex items-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Finalizing Quiz...
                          </>
                        ) : (
                          'View Quiz Summary'
                        )}
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
