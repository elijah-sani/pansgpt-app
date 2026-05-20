'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Clock3, Loader2 } from 'lucide-react';

import { AuthMessage } from '@/components/auth/AuthMessage';
import { INPUT_CLASS_NAME, LEVELS, PRIMARY_BUTTON_CLASS_NAME } from '@/components/auth/authConstants';
import { api } from '@/lib/api';

type RestrictionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

type RestrictionRecord = {
  id: string;
  title: string;
  course_code: string | null;
  course_title: string | null;
  level: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  status: RestrictionStatus;
  created_at?: string | null;
};

type RestrictionsResponse = {
  data: RestrictionRecord[];
};

type RestrictionFormState = {
  level: string;
  course_code: string;
  duration_option: string;
  custom_duration_hours: string;
  custom_duration_minutes: string;
};

const initialFormState: RestrictionFormState = {
  level: '',
  course_code: '',
  duration_option: '60',
  custom_duration_hours: '',
  custom_duration_minutes: '',
};

const DURATION_OPTIONS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: 'custom', label: 'Custom' },
] as const;

export default function LecturerRestrictionsPage() {
  const [restrictions, setRestrictions] = useState<RestrictionRecord[]>([]);
  const [form, setForm] = useState<RestrictionFormState>(initialFormState);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeCancelId, setActiveCancelId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const fetchRestrictions = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await api.get('/lecturer/restrictions');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Failed to load restrictions');
      }

      const payload: RestrictionsResponse = await response.json();
      setRestrictions(payload.data || []);
    } catch (error) {
      console.error('Failed to fetch restrictions:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load restrictions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchRestrictions();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchRestrictions]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const orderedRestrictions = useMemo(
    () =>
      [...restrictions].sort((left, right) => {
        const leftTime = Date.parse(left.created_at || left.start_time || '') || 0;
        const rightTime = Date.parse(right.created_at || right.start_time || '') || 0;
        return rightTime - leftTime;
      }),
    [restrictions],
  );

  const updateFormField = <K extends keyof RestrictionFormState>(field: K, value: RestrictionFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitRestriction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const normalizedLevel = form.level.trim();
    const normalizedCourseCode = form.course_code.trim();
    const durationMinutes =
      form.duration_option === 'custom'
        ? Number.parseInt(form.custom_duration_hours || '0', 10) * 60 + Number.parseInt(form.custom_duration_minutes || '0', 10)
        : Number.parseInt(form.duration_option, 10);

    if (!normalizedLevel) {
      setFormError('Student level is required.');
      return;
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setFormError('Set how long the restriction should last.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post('/lecturer/restrictions', {
        course_code: normalizedCourseCode || null,
        level: normalizedLevel,
        duration_minutes: durationMinutes,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Failed to create restriction');
      }

      setForm(initialFormState);
      setHistoryOpen(true);
      await fetchRestrictions();
    } catch (error) {
      console.error('Failed to create restriction:', error);
      setFormError(error instanceof Error ? error.message : 'Failed to create restriction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelRestriction = async (restriction: RestrictionRecord) => {
    const label = restriction.course_code || restriction.title;
    if (!window.confirm(`Cancel the restriction for ${label}?`)) {
      return;
    }

    setFormError(null);
    setActiveCancelId(restriction.id);
    try {
      const response = await api.patch(`/lecturer/restrictions/${restriction.id}/cancel`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Failed to cancel restriction');
      }

      await fetchRestrictions();
    } catch (error) {
      console.error('Failed to cancel restriction:', error);
      setFormError(error instanceof Error ? error.message : 'Failed to cancel restriction');
    } finally {
      setActiveCancelId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-5 md:px-0">
      <div className="md:grid md:grid-cols-12 md:gap-8">
        <div className="space-y-8 md:col-span-10 md:col-start-2 lg:col-span-10 lg:col-start-2">
          <header>
            <h1 className="text-xl font-bold text-foreground md:text-3xl">Test Restrictions</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
              Choose the level, add the course code, and set how long the restriction should last.
            </p>
          </header>

          <section>
            <form onSubmit={submitRestriction} className="space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-foreground">
                      Student level
                      <span className="ml-1 text-rose-600">*</span>
                    </label>
                    <select
                      autoFocus
                      value={form.level}
                      onChange={(event) => updateFormField('level', event.target.value)}
                      className={`${INPUT_CLASS_NAME} appearance-none`}
                    >
                      <option value="">Select level</option>
                      {LEVELS.map((level) => (
                        <option key={level} value={`${level}L`}>
                          {level}L
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-foreground">Course code</label>
                    <input
                      type="text"
                      value={form.course_code}
                      onChange={(event) => updateFormField('course_code', event.target.value)}
                      className={INPUT_CLASS_NAME}
                      placeholder="PCL 302"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="w-full max-w-sm space-y-1.5">
                      <label className="text-sm font-bold text-foreground">
                        How long should it last?
                        <span className="ml-1 text-rose-600">*</span>
                      </label>
                      <div className="space-y-3">
                        <div className="relative">
                          <Clock3 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                          <select
                            value={form.duration_option}
                            onChange={(event) => updateFormField('duration_option', event.target.value)}
                            className={`${INPUT_CLASS_NAME} appearance-none pl-12`}
                          >
                            {DURATION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {form.duration_option === 'custom' ? (
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={form.custom_duration_hours}
                              onChange={(event) => updateFormField('custom_duration_hours', event.target.value)}
                              className={INPUT_CLASS_NAME}
                              placeholder="Hours"
                            />
                            <input
                              type="number"
                              min="0"
                              step="5"
                              value={form.custom_duration_minutes}
                              onChange={(event) => updateFormField('custom_duration_minutes', event.target.value)}
                              className={INPUT_CLASS_NAME}
                              placeholder="Minutes"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={`${PRIMARY_BUTTON_CLASS_NAME.replace('w-full ', '')} w-full lg:mt-8 lg:w-auto`}
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start Restriction'}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Choose how long the restriction should stay active.</p>
                </div>
              </div>

              {formError ? <AuthMessage message={{ type: 'error', text: formError }} /> : null}

              <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((current) => !current)}
                  className="inline-flex items-center gap-2 text-sm font-bold text-foreground transition-colors hover:text-primary"
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${historyOpen ? 'rotate-90' : ''}`} />
                  View live and past restrictions
                </button>
              </div>
            </form>

            {historyOpen ? (
              <div className="mt-6 border-t border-border pt-6">
                {loadError ? (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
                    <h3 className="text-sm font-semibold text-rose-700">Unable to load test restrictions. Please try again.</h3>
                    <p className="mt-2 text-sm text-rose-700/90">{loadError}</p>
                  </div>
                ) : isLoading ? (
                  <div className="flex min-h-[120px] items-center gap-3 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span>Loading restrictions...</span>
                  </div>
                ) : (
                  <HistoryList restrictions={orderedRestrictions} now={now} activeCancelId={activeCancelId} onCancel={cancelRestriction} />
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function HistoryList({
  restrictions,
  now,
  activeCancelId,
  onCancel,
}: {
  restrictions: RestrictionRecord[];
  now: number;
  activeCancelId: string | null;
  onCancel: (restriction: RestrictionRecord) => void;
}) {
  return (
    <div>
      {restrictions.length === 0 ? (
        <div className="text-sm text-muted-foreground">No restrictions yet.</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left">
              <thead className="bg-muted/30">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Course</th>
                  <th className="px-6 py-3 font-medium">Level</th>
                  <th className="px-6 py-3 font-medium">Started</th>
                  <th className="px-6 py-3 font-medium">Ends</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {restrictions.map((restriction) => (
                  <tr key={restriction.id} className="border-t border-border align-top">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{restriction.course_code || restriction.title}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">{restriction.level}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{formatDateTime(restriction.start_time)}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{formatEndValue(restriction, now)}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {canCancelRestriction(restriction.status) ? (
                        <button
                          type="button"
                          onClick={() => onCancel(restriction)}
                          disabled={activeCancelId === restriction.id}
                          className="font-semibold text-rose-600 transition-colors hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {activeCancelId === restriction.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      ) : (
                        <span className="capitalize">{restriction.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {restrictions.map((restriction) => (
              <article key={restriction.id} className="rounded-2xl border border-border px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-foreground">{restriction.course_code || restriction.title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{restriction.level}</p>
                  </div>
                  {canCancelRestriction(restriction.status) ? (
                    <button
                      type="button"
                      onClick={() => onCancel(restriction)}
                      disabled={activeCancelId === restriction.id}
                      className="text-sm font-semibold text-rose-600 transition-colors hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {activeCancelId === restriction.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  ) : (
                    <span className="text-sm capitalize text-muted-foreground">{restriction.status}</span>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <MobileDetail label="Started" value={formatDateTime(restriction.start_time)} />
                  <MobileDetail label="Ends" value={formatEndValue(restriction, now)} />
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MobileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-0 py-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">{value}</dd>
    </div>
  );
}

function canCancelRestriction(status: RestrictionStatus) {
  return status === 'active' || status === 'scheduled';
}

function formatEndValue(restriction: RestrictionRecord, now: number) {
  if (canCancelRestriction(restriction.status)) {
    return formatCountdown(restriction.end_time, now);
  }

  return formatDateTime(restriction.end_time);
}

function formatCountdown(value: string | null | undefined, now: number) {
  if (!value) {
    return '—';
  }

  const endTime = new Date(value).getTime();
  if (Number.isNaN(endTime)) {
    return value;
  }

  const remaining = endTime - now;
  if (remaining <= 0) {
    return 'Ending now';
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}
