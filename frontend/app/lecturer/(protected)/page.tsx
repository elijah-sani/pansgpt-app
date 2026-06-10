'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpenCheck, CircleHelp, FileStack, Loader2, Search, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { api } from '@/lib/api';
import { fetchBootstrap } from '@/lib/bootstrap-cache';
import {
  buildLecturerSearchResults,
  groupLecturerSearchResults,
  type LecturerSearchMaterial,
  type LecturerSearchRestriction,
  type LecturerSearchResult,
} from '@/lib/lecturer-dashboard-search';

type RestrictionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
type MaterialStatus = 'pending_review' | 'approved' | 'rejected' | 'cancelled';

type RestrictionRecord = {
  id: string;
  title: string;
  course_code: string | null;
  level: string;
  start_time: string;
  status: RestrictionStatus;
  created_at?: string | null;
};

type MaterialSubmission = {
  id: string;
  title: string;
  course_code: string | null;
  status: MaterialStatus;
  pans_library_id: string | null;
  library_embedding_status: 'pending' | 'processing' | 'completed' | 'failed' | string | null;
  library_embedding_progress: number | null;
  created_at: string | null;
};

type LecturerIdentity = {
  title: string;
  fullName: string;
  status: string;
  universityName: string;
};

type DashboardData = {
  lecturer: LecturerIdentity;
  restrictions: RestrictionRecord[];
  materials: MaterialSubmission[];
};

type ActivityEntry = {
  id: string;
  title: string;
  meta: string;
  status: string;
  statusClassName: string;
  timestamp: number;
};

const DEFAULT_LECTURER: LecturerIdentity = {
  title: '',
  fullName: 'Lecturer',
  status: 'active',
  universityName: 'Not provided',
};

const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string> = {
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const MATERIAL_STATUS_CLASSNAMES: Record<MaterialStatus, string> = {
  pending_review: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  approved: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  rejected: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  cancelled: 'border-slate-500/20 bg-slate-500/10 text-slate-300',
};

const RESTRICTION_STATUS_CLASSNAMES: Record<RestrictionStatus, string> = {
  active: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  scheduled: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
  completed: 'border-border bg-muted/50 text-muted-foreground',
  cancelled: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
};

export default function LecturerDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData>({
    lecturer: DEFAULT_LECTURER,
    restrictions: [],
    materials: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  async function loadDashboard() {
    setIsLoading(true);
    setError(null);

    try {
      const [bootstrap, restrictionsResponse, materialsResponse] = await Promise.all([
        fetchBootstrap(),
        api.get('/lecturer/restrictions'),
        api.get('/lecturer/materials'),
      ]);

      const lecturer = readLecturerIdentity(bootstrap);

      const restrictions = restrictionsResponse.ok ? (((await restrictionsResponse.json()) as { data?: RestrictionRecord[] }).data || []) : [];
      const materials = materialsResponse.ok ? (((await materialsResponse.json()) as { data?: MaterialSubmission[] }).data || []) : [];

      setDashboard({
        lecturer,
        restrictions,
        materials,
      });
    } catch (err) {
      console.error('Failed to load lecturer overview:', err);
      setError(err instanceof Error ? err.message : 'Unable to load lecturer dashboard.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const recentActivity = useMemo(() => {
    const restrictionActivity: ActivityEntry[] = dashboard.restrictions.map((restriction) => ({
      id: `restriction-${restriction.id}`,
      title: restriction.course_code || restriction.title,
      meta: `Restriction - ${restriction.level} - ${formatDateTime(restriction.created_at || restriction.start_time)}`,
      status: formatLabel(restriction.status),
      statusClassName: RESTRICTION_STATUS_CLASSNAMES[restriction.status],
      timestamp: getTimestamp(restriction.created_at || restriction.start_time),
    }));

    const materialActivity: ActivityEntry[] = dashboard.materials.map((material) => ({
      id: `material-${material.id}`,
      title: material.title,
      meta: `Material - ${material.course_code || 'Course not set'} - ${formatDateTime(material.created_at)}`,
      status: getMaterialActivityStatus(material),
      statusClassName: MATERIAL_STATUS_CLASSNAMES[material.status],
      timestamp: getTimestamp(material.created_at),
    }));

    return [...restrictionActivity, ...materialActivity].sort((left, right) => right.timestamp - left.timestamp).slice(0, 3);
  }, [dashboard.materials, dashboard.restrictions]);

  const displayName = [dashboard.lecturer.title, dashboard.lecturer.fullName].filter(Boolean).join(' ').trim() || 'Lecturer';
  const compactName = getCompactGreetingName(dashboard.lecturer.title, dashboard.lecturer.fullName);
  const timeGreeting = getTimeGreeting();

  const searchResults = useMemo(() => {
    return buildLecturerSearchResults({
      query: searchQuery,
      restrictions: dashboard.restrictions as LecturerSearchRestriction[],
      materials: dashboard.materials as LecturerSearchMaterial[],
    });
  }, [dashboard.materials, dashboard.restrictions, searchQuery]);

  const groupedSearchResults = useMemo(() => {
    return groupLecturerSearchResults(searchResults);
  }, [searchResults]);

  const handleSearchResultSelect = (href: string) => {
    setSearchQuery('');
    router.push(href);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-5 md:px-0">
      <div className="space-y-6 md:space-y-7">
        <div className="space-y-5 md:hidden">
          <section className="space-y-1">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">Hi, {compactName}!</h2>
            <p className="text-sm text-muted-foreground">{timeGreeting}</p>
          </section>

          <MobileSearchEntry />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Quick tools</h2>
            <div className="grid grid-cols-2 gap-3">
              <QuickToolCard href="/lecturer/restrictions" icon={BookOpenCheck} title="Start restriction" />
              <QuickToolCard href="/lecturer/materials" icon={FileStack} title="Submit material" />
              <QuickToolCard href="/lecturer/help" icon={CircleHelp} title="Help guide" />
              <QuickToolCard href="/lecturer/profile" icon={UserRound} title="Profile" />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent activity</h2>
            {recentActivity.length === 0 ? (
              <EmptyActivityState />
            ) : (
              <div className="space-y-3">
                {recentActivity.map((item) => (
                  <MobileActivityCard key={item.id} title={item.title} meta={item.meta} status={item.status} statusClassName={item.statusClassName} />
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="hidden space-y-6 md:block">
          <div className="space-y-5 border-b border-border pb-6">
            <div className="ml-auto w-full max-w-sm">
              <DashboardSearch value={searchQuery} onChange={setSearchQuery} groupedResults={groupedSearchResults} onSelect={handleSearchResultSelect} />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Lecturer dashboard</p>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-[2.8rem]">Welcome back, {displayName}</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Manage test restrictions, submit materials, and support student learning.
              </p>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
            <h2 className="text-sm font-semibold text-rose-200">Unable to load dashboard</h2>
            <p className="mt-2 text-sm text-rose-100/90">{error}</p>
          </section>
        ) : isLoading ? (
          <section className="flex min-h-[220px] items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </section>
        ) : (
          <section className="hidden md:grid md:grid-cols-[minmax(0,1fr)]">
            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Quick actions</h2>
                <div className="grid gap-3 xl:grid-cols-3">
                  <QuickActionTile
                    href="/lecturer/restrictions"
                    icon={BookOpenCheck}
                    title="Start restriction"
                    description="Create or manage access restrictions for tests."
                  />
                  <QuickActionTile
                    href="/lecturer/materials"
                    icon={FileStack}
                    title="Submit material"
                    description="Upload course materials for review and student access."
                  />
                  <QuickActionTile
                    href="/lecturer/help"
                    icon={CircleHelp}
                    title="Help guide"
                    description="Open the lecturer help guide and platform instructions."
                  />
                </div>
              </section>

              <ActivityPanel title="Recent activity">
                {recentActivity.length === 0
                  ? null
                  : recentActivity.map((item) => (
                      <ActivityItem
                        key={item.id}
                        title={item.title}
                        meta={item.meta}
                        status={item.status}
                        statusClassName={item.statusClassName}
                      />
                    ))}
              </ActivityPanel>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function getMaterialActivityStatus(material: MaterialSubmission) {
  if (material.pans_library_id) {
    const embedding = String(material.library_embedding_status || '').toLowerCase();
    if (embedding === 'processing') {
      const pct = typeof material.library_embedding_progress === 'number'
        ? Math.max(0, Math.min(100, material.library_embedding_progress))
        : 0;
      return `Processing ${pct}%`;
    }
    if (embedding === 'completed') return 'Completed';
    if (embedding === 'failed') return 'Failed';
    if (embedding === 'pending') return 'Pending';
  }
  return MATERIAL_STATUS_LABELS[material.status];
}

function MobileSearchEntry() {
  return (
    <Link
      href="/lecturer/search"
      className="relative flex h-12 items-center rounded-full border border-border bg-background/90 pl-11 pr-4 text-sm text-muted-foreground transition-colors hover:border-primary/30"
    >
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <span>Search</span>
    </Link>
  );
}

function DashboardSearch({
  value,
  onChange,
  groupedResults,
  onSelect,
}: {
  value: string;
  onChange: (value: string) => void;
  groupedResults: Array<{ category: LecturerSearchResult['category']; items: LecturerSearchResult[] }>;
  onSelect: (href: string) => void;
}) {
  const hasQuery = value.trim().length > 0;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        className="h-12 w-full rounded-full border border-border bg-background/90 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40"
      />

      {hasQuery ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 overflow-hidden rounded-2xl border border-border bg-background/95 shadow-[0_18px_48px_rgba(0,0,0,0.22)] backdrop-blur">
          {groupedResults.length === 0 ? (
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-foreground">No matches found.</p>
              <p className="mt-1 text-sm text-muted-foreground">Try searching for restrictions, materials, help, or profile.</p>
            </div>
          ) : (
            groupedResults.map((group, index) => (
              <div key={group.category} className={index !== groupedResults.length - 1 ? 'border-b border-border/70' : ''}>
                <p className="px-4 pt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.category}</p>
                <div className="p-2">
                  {group.items.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => onSelect(result.href)}
                      className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{result.description}</p>
                      </div>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function QuickToolCard({ href, icon: Icon, title }: { href: string; icon: LucideIcon; title: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border bg-background/90 p-4 transition-colors hover:border-primary/30 hover:bg-muted/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-4 text-sm font-semibold leading-5 text-foreground">{title}</p>
    </Link>
  );
}

function QuickActionTile({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition-colors hover:border-primary/20 hover:bg-white/[0.06]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}

function ActivityPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const hasItems = Boolean(children);

  return (
    <section className="border-t border-border pt-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
      {hasItems ? <div className="relative mt-5">{children}</div> : <EmptyActivityState className="mt-4" />}
    </section>
  );
}

function EmptyActivityState({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-dashed border-border bg-background/50 p-4 ${className}`.trim()}>
      <p className="text-sm font-medium text-foreground">No recent activity yet.</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Start a restriction or submit a material to see your latest lecturer actions here.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/lecturer/restrictions"
          className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          Start restriction
        </Link>
        <Link
          href="/lecturer/materials"
          className="inline-flex min-h-10 items-center rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          Submit material
        </Link>
      </div>
    </div>
  );
}

function ActivityItem({
  title,
  meta,
  status,
  statusClassName,
}: {
  title: string;
  meta: string;
  status: string;
  statusClassName: string;
}) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
      <div className="relative flex justify-center">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-primary/20" />
        <span className="relative mt-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/10" />
      </div>

      <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{meta}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClassName}`}>{status}</span>
      </div>
    </div>
  );
}

function MobileActivityCard({
  title,
  meta,
  status,
  statusClassName,
}: {
  title: string;
  meta: string;
  status: string;
  statusClassName: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/90 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{meta}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClassName}`}>{status}</span>
      </div>
    </div>
  );
}

function readLecturerIdentity(bootstrap: Awaited<ReturnType<typeof fetchBootstrap>>): LecturerIdentity {
  const source = bootstrap?.lecturer_profile;
  const profile = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};

  return {
    title: readString(profile.title),
    fullName: readString(profile.full_name) || 'Lecturer',
    status: bootstrap?.lecturer_status || readString(profile.status) || 'active',
    universityName: readString(profile.university_name) || 'Not provided',
  };
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getTimestamp(value: string | null | undefined) {
  return Date.parse(value || '') || 0;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getCompactGreetingName(title: string, fullName: string) {
  const firstName = fullName.trim().split(/\s+/)[0] || 'Lecturer';
  return [title, firstName].filter(Boolean).join(' ').trim() || firstName;
}
