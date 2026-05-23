'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';

const GUIDE_SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    title: 'Lecturer tools overview',
    body: [
      'PansGPT Lecturer gives approved lecturers access to tools for managing test restrictions and submitting materials students can study from.',
      'Only approved lecturer accounts can access lecturer tools.',
    ],
    bullets: [
      'Restrict student AI access during active assessments.',
      'Submit verified course materials for admin review.',
      'Contact admin when account or access details need attention.',
    ],
  },
  {
    id: 'test-restrictions',
    label: 'Test Restrictions',
    title: 'Pause student AI access for a level',
    body: [
      'Use restrictions only when a test, CBT, assessment, or exam is about to begin. Restrictions are meant to pause student AI access for the selected level during the test window.',
    ],
    bullets: [
      'Choose the student level before you start the restriction.',
      'Set how long the restriction should last.',
      'Students in that level will see a temporary blocker until the timer ends.',
      'Cancel a restriction if it was started by mistake or the test ends early.',
      'Admins can also cancel restrictions if needed.',
    ],
  },
  {
    id: 'material-submissions',
    label: 'Material Submissions',
    title: 'Submit materials for study use',
    body: ['Upload one course material at a time so it can be reviewed and prepared for student study use.'],
    bullets: [
      'Add level, course code, topic, and optional course title.',
      'PDF files can be approved directly.',
      'DOC, DOCX, PPT, and PPTX files must be converted to PDF before approval.',
      'Approved materials are processed so students and the AI study system can use them.',
    ],
  },
  {
    id: 'account-approval',
    label: 'Account & Approval',
    title: 'Understand lecturer account approval',
    body: ['Lecturer registration must be reviewed before access is activated.'],
    bullets: [
      'If your profile details are wrong, contact PansGPT admin.',
      'If your account is suspended, revoked, or rejected, contact admin for review.',
      'Profile editing is not available inside the lecturer portal yet.',
    ],
  },
  {
    id: 'before-a-test',
    label: 'Before a Test',
    title: 'Before starting a test restriction',
    body: ['Use this checklist before turning on a restriction so students are blocked only for the intended assessment window.'],
    bullets: [
      'Confirm the affected student level.',
      'Confirm the assessment start time and expected duration.',
      'Add the course code so the restriction is easier to identify later.',
      'Start the restriction close to the assessment time to avoid blocking students too early.',
    ],
  },
  {
    id: 'after-materials',
    label: 'After Submitting Materials',
    title: 'After submitting materials',
    body: ['Submitted materials go to PansGPT admin for review before they are prepared for student study use.'],
    bullets: [
      'Wait for admin review after submission.',
      'Keep the original file available in case admin requests a cleaner PDF.',
      'Submit one material at a time so each topic can be reviewed clearly.',
    ],
  },
  {
    id: 'material-rejected',
    label: 'Material Rejected',
    title: 'Why a material may be rejected',
    body: ['A material can be rejected when admin cannot safely prepare it for student use or when the submission details are incomplete.'],
    bullets: [
      'The file may be unreadable, duplicated, or not related to the selected course.',
      'The material may need to be converted to PDF first.',
      'The course code, topic, or level may need correction.',
    ],
  },
  {
    id: 'student-view',
    label: 'Student View',
    title: 'What students see during a restriction',
    body: ['Students in the selected level see a temporary blocker while the restriction is active.'],
    bullets: [
      'The blocker explains that access is paused for an assessment.',
      'Students can return after the timer ends.',
      'Cancelling the restriction early restores access for that level.',
    ],
  },
  {
    id: 'support',
    label: 'Support',
    title: 'Contact PansGPT admin',
    body: ['If you need help with restrictions, materials, or account access, contact PansGPT admin.'],
    bullets: [
      'Include your lecturer email and the exact issue.',
      'Mention the course, level, or material if the issue is related to a submission.',
      'For urgent test restriction issues, contact admin before the assessment starts where possible.',
    ],
  },
] as const;

type GuideSection = (typeof GUIDE_SECTIONS)[number];

export default function LecturerHelpPage() {
  const [activeSection, setActiveSection] = useState<GuideSection['id']>(getInitialActiveSection);
  const [openMobileSection, setOpenMobileSection] = useState<GuideSection['id'] | null>(getInitialActiveSection);

  useEffect(() => {
    const syncFromHash = () => {
      const sectionId = getInitialActiveSection();
      setActiveSection(sectionId);
      setOpenMobileSection(sectionId);
      window.scrollTo({ top: 0, behavior: 'auto' });

      queueSectionScroll(sectionId, 'smooth');
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);

    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    const root = getHelpScrollContainer();
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry?.target.id && GUIDE_SECTIONS.some((section) => section.id === visibleEntry.target.id)) {
          setActiveSection(visibleEntry.target.id as GuideSection['id']);
        }
      },
      {
        root,
        rootMargin: root ? '-8% 0px -72% 0px' : '-18% 0px -62% 0px',
        threshold: [0, 0.15, 0.35, 0.6],
      }
    );

    GUIDE_SECTIONS.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, []);

  const jumpToSection = (sectionId: GuideSection['id']) => {
    const element = document.getElementById(sectionId);
    if (!element) {
      return;
    }

    setActiveSection(sectionId);
    setOpenMobileSection(sectionId);
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = sectionId;
    window.history.replaceState(null, '', nextUrl.toString());
    queueSectionScroll(sectionId, 'smooth');
  };

  const scrollToSection = (sectionId: GuideSection['id']) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    jumpToSection(sectionId);
  };

  return (
    <div className="w-full px-1 pb-14 pt-2 sm:px-0 sm:pt-0">
      <div className="mx-auto grid w-full max-w-xl gap-8 lg:max-w-7xl lg:grid-cols-[260px_minmax(0,760px)_1fr] lg:gap-12">
        <aside className="hidden lg:sticky lg:top-8 lg:block lg:max-h-[calc(100vh-4rem)] lg:self-start">
          <TableOfContents activeSection={activeSection} onNavigate={scrollToSection} />
        </aside>

        <article className="min-w-0">
          <header className="pb-6 sm:pb-8 lg:border-b lg:border-border">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Lecturer guide</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Help &amp; Guide</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Quick documentation for managing test restrictions, submitting course materials, and getting account support.
            </p>
          </header>

          <MobileHelpAccordion
            openSection={openMobileSection}
            onToggle={(sectionId) => setOpenMobileSection((current) => (current === sectionId ? null : sectionId))}
          />

          <div className="hidden divide-y divide-border lg:block">
            {GUIDE_SECTIONS.map((section) => (
              <GuideSectionBlock key={section.id} section={section} />
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

function TableOfContents({
  activeSection,
  onNavigate,
}: {
  activeSection: GuideSection['id'];
  onNavigate: (sectionId: GuideSection['id']) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <nav aria-label="Help page sections" className="border-l border-border pl-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">On this page</p>
      <div className="mt-3 flex flex-col gap-1">
        {GUIDE_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={onNavigate(section.id)}
            aria-current={activeSection === section.id ? 'true' : undefined}
            className={`rounded-md px-2 py-1.5 text-sm transition-colors ${
              activeSection === section.id ? 'bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {section.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function MobileHelpAccordion({
  openSection,
  onToggle,
}: {
  openSection: GuideSection['id'] | null;
  onToggle: (sectionId: GuideSection['id']) => void;
}) {
  return (
    <div className="mt-5 divide-y divide-border border-y border-border lg:hidden">
      {GUIDE_SECTIONS.map((section) => {
        const isOpen = openSection === section.id;

        return (
          <section key={section.id} className="scroll-mt-24">
            <button
              type="button"
              onClick={() => onToggle(section.id)}
              aria-expanded={isOpen}
              aria-controls={`mobile-help-${section.id}`}
              className="flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left"
            >
              <span className="text-sm font-medium text-foreground">{section.label}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <div
              id={`mobile-help-${section.id}`}
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
              <div className="overflow-hidden">
                <div className="pb-5">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">{section.title}</h2>
                  <GuideSectionContent section={section} />
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function getInitialActiveSection(): GuideSection['id'] {
  if (typeof window === 'undefined') {
    return 'overview';
  }

  const hash = window.location.hash.split('#').filter(Boolean).pop() || '';
  const hashSection = GUIDE_SECTIONS.find((section) => section.id === hash);
  return hashSection?.id || 'overview';
}

function scrollToSectionWithOffset(element: HTMLElement, behavior: ScrollBehavior) {
  const mobileHeader = document.querySelector<HTMLElement>('[data-lecturer-mobile-header="true"]');
  const mobileOffset = (mobileHeader?.offsetHeight || 0) + 20;
  const desktopOffset = 24;
  const scrollContainer = getHelpScrollContainer();

  if (window.innerWidth < 1024 || !scrollContainer) {
    const top = window.scrollY + element.getBoundingClientRect().top - mobileOffset;

    window.scrollTo({
      top: Math.max(top, 0),
      behavior,
    });
    return;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const top = scrollContainer.scrollTop + (element.getBoundingClientRect().top - containerRect.top) - desktopOffset;

  scrollContainer.scrollTo({
    top: Math.max(top, 0),
    behavior,
  });
}

function queueSectionScroll(sectionId: GuideSection['id'], behavior: ScrollBehavior) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          scrollToSectionWithOffset(element, behavior);
        }
      }, 180);
    });
  });
}

function getHelpScrollContainer() {
  if (typeof window === 'undefined' || window.innerWidth < 1024) {
    return null;
  }

  return document.querySelector('main');
}

function GuideSectionBlock({ section }: { section: GuideSection }) {
  return (
    <section id={section.id} className="scroll-mt-24 py-8 sm:py-9 lg:scroll-mt-10 lg:py-11">
      <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{section.title}</h2>
      <GuideSectionContent section={section} />
    </section>
  );
}

function GuideSectionContent({ section }: { section: GuideSection }) {
  return (
    <>
      <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground sm:text-base">
        {section.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <ul className="mt-5 list-disc space-y-2 pl-5">
        {section.bullets.map((bullet) => (
          <li key={bullet} className="text-sm leading-7 text-muted-foreground marker:text-muted-foreground/70 sm:text-base">
            {bullet}
          </li>
        ))}
      </ul>
      {section.id === 'support' ? (
        <div className="mt-6">
          <Link
            href="https://wa.me/2349042581125"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
          >
            Contact admin on WhatsApp
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </>
  );
}
