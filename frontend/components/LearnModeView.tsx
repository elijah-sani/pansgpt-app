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
  sections?: SectionProgressItem[]; // [LEARN MODE UI]
  onSectionsLoaded?: (sections: SectionProgressItem[]) => void; // [LEARN MODE UI]
}

// ── MasteredAccordion: collapsed zone shown at the top of the list ──────────
function MasteredAccordion({
  sections,
  statusMeta,
  onOpen,
}: {
  sections: SectionProgressItem[];
  statusMeta: Record<string, { accent: string; glow: string; pctColor: string; pctBg: string; label: string }>;
  onOpen: (index: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const meta = statusMeta.mastered;

  return (
    <div className="mb-4">
      {/* Toggle row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#16a34a]/8 hover:bg-[#16a34a]/12 transition-colors mb-1"
      >
        <div className="flex items-center gap-2">
          <Check className="w-3 h-3 text-[#16a34a]" />
          <span className="text-[10px] font-bold text-[#16a34a] uppercase tracking-widest">
            {sections.length} section{sections.length !== 1 ? 's' : ''} mastered
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#16a34a]/60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expandable list */}
      <div
        className={`overflow-hidden transition-all duration-250 ease-out space-y-1.5 ${
          open ? 'max-h-[600px] opacity-100 pt-1' : 'max-h-0 opacity-0'
        }`}
      >
        {sections.map((sec, i) => {
          const pct = sec.last_score !== null ? `${sec.last_score}%` : '—';
          return (
            <div key={sec.section_index} className="lm-row-enter" style={{ animationDelay: `${i * 35}ms` }}>
              <div
                className={`w-full text-left bg-card border border-border/40 border-l-4 ${meta.accent} rounded-lg py-2.5 px-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-muted/20 transition-colors`}
                onClick={() => onOpen(sec.section_index)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[10px] font-bold text-muted-foreground/60 shrink-0">{sec.section_index + 1}</span>
                  <h4 className="text-[11px] font-semibold text-foreground/70 truncate">{sec.title}</h4>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${meta.pctBg} ${meta.pctColor}`}>{pct}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Divider below mastered zone */}
      {open && <div className="border-t border-border/30 mt-3 mb-3" />}
      {!open && <div className="border-t border-border/20 mt-2 mb-3" />}
    </div>
  );
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
    // ── Partition sections into three zones ──────────────────────────────
    const masteredSections  = sections.filter(s => s.status === 'mastered');
    const activeSections    = sections.filter(s => s.status === 'in_progress' || s.status === 'needs_review');
    const upcomingSections  = sections.filter(s => s.status === 'not_started');

    // ── Per-status visual config ──────────────────────────────────────────
    const statusMeta: Record<string, {
      accent: string;         // left border colour (Tailwind border-* class)
      glow: string;           // subtle box-shadow for "Now" rows
      pctColor: string;       // percentage badge text colour
      pctBg: string;          // percentage badge bg
      label: string;
    }> = {
      mastered:    { accent: 'border-l-[#16a34a]', glow: '',                              pctColor: 'text-[#16a34a]', pctBg: 'bg-[#16a34a]/10', label: 'Mastered'     },
      in_progress: { accent: 'border-l-blue-500',  glow: 'shadow-[0_0_0_1px_rgba(59,130,246,0.15)]', pctColor: 'text-blue-400',      pctBg: 'bg-blue-500/10',  label: 'In Progress'  },
      needs_review:{ accent: 'border-l-amber-400', glow: 'shadow-[0_0_0_1px_rgba(251,191,36,0.15)]',  pctColor: 'text-amber-400',     pctBg: 'bg-amber-400/10', label: 'Needs Review' },
      not_started: { accent: 'border-l-border',    glow: '',                              pctColor: 'text-muted-foreground', pctBg: 'bg-muted/60', label: 'Not Started'  },
    };

    // ── A single reusable row ─────────────────────────────────────────────
    const SectionRow = ({
      sec,
      isActive,
      animIndex,
    }: {
      sec: SectionProgressItem;
      isActive: boolean;
      animIndex: number;
    }) => {
      const [expanded, setExpanded] = React.useState(false);
      const meta = statusMeta[sec.status] ?? statusMeta.not_started;
      const pct  = sec.last_score !== null ? `${sec.last_score}%` : '—';

      return (
        <div
          className="lm-row-enter"
          style={{ animationDelay: `${animIndex * 45}ms` }}
        >
          {/* Main clickable row */}
          <div
            className={[
              'w-full text-left bg-card border-l-4 rounded-lg transition-all cursor-pointer',
              'border border-border/40',
              meta.accent,
              isActive ? meta.glow : '',
              isActive ? 'py-3.5 px-4' : 'py-2.5 px-4',
              expanded ? 'rounded-b-none border-b-0' : '',
            ].join(' ')}
            onClick={() => setExpanded(v => !v)}
          >
            <div className="flex items-center justify-between gap-3">
              {/* Left: number + title */}
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={[
                    'text-[10px] font-bold shrink-0',
                    isActive ? 'text-foreground/60' : 'text-muted-foreground/60',
                  ].join(' ')}
                >
                  {sec.section_index + 1}
                </span>
                <div className="min-w-0">
                  {isActive && (
                    <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
                       style={{ color: meta.pctColor.replace('text-', '') }}>
                      {meta.label}
                    </p>
                  )}
                  <h4 className={[
                    'font-semibold truncate',
                    isActive ? 'text-xs text-foreground' : 'text-[11px] text-foreground/70',
                  ].join(' ')}>
                    {sec.title}
                  </h4>
                </div>
              </div>

              {/* Right: pct badge + chevron */}
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${meta.pctBg} ${meta.pctColor}`}>
                  {pct}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                />
              </div>
            </div>
          </div>

          {/* Expanded detail panel */}
          <div
            className={[
              'overflow-hidden transition-all duration-200 ease-out',
              'bg-card border border-border/40 border-l-4 border-t-0 rounded-b-lg',
              meta.accent,
              expanded ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0',
            ].join(' ')}
          >
            <div className="px-4 pb-3 pt-2 flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted-foreground">
                {sec.page_start
                  ? `Pages ${sec.page_start}–${sec.page_end}`
                  : 'Pages not yet available'}
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); handleOpenSection(sec.section_index); }}
                className="flex items-center gap-1.5 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors shrink-0"
              >
                Open Section <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full bg-background overflow-y-auto px-4 py-5">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Study Sections</h2>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Zone 1: Mastered (collapsed accordion) ─────────────────────── */}
        {masteredSections.length > 0 && <MasteredAccordion sections={masteredSections} statusMeta={statusMeta} onOpen={handleOpenSection} />}

        {/* ── Zone 2: Now — In Progress / Needs Review ───────────────────── */}
        {activeSections.length > 0 && (
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2 px-1">
              Continue
            </p>
            <div className="space-y-2">
              {activeSections.map((sec, i) => (
                <SectionRow key={sec.section_index} sec={sec} isActive={true} animIndex={masteredSections.length > 0 ? i + 1 : i} />
              ))}
            </div>
          </div>
        )}

        {/* ── Zone 3: Upcoming — Not Started ─────────────────────────────── */}
        {upcomingSections.length > 0 && (
          <div>
            {activeSections.length > 0 && (
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2 px-1 mt-1">
                Upcoming
              </p>
            )}
            <div className="space-y-1.5">
              {upcomingSections.map((sec, i) => (
                <SectionRow key={sec.section_index} sec={sec} isActive={false} animIndex={activeSections.length + i} />
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {sections.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
            <BookOpen className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground">No sections found</p>
          </div>
        )}

        <style>{`
          @keyframes lm-row-in {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0);   }
          }
          .lm-row-enter {
            animation: lm-row-in 0.28s ease-out both;
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
