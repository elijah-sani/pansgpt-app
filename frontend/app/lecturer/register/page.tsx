'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleHelp, Eye, EyeOff, Loader2 } from 'lucide-react';

import { AuthMessage } from '@/components/auth/AuthMessage';
import { INPUT_CLASS_NAME, PRIMARY_BUTTON_CLASS_NAME } from '@/components/auth/authConstants';
import type { AuthMessage as AuthMessageType } from '@/components/auth/types';
import { api } from '@/lib/api';

type University = {
  id: string;
  name: string;
  short_name?: string | null;
  country?: string | null;
  state?: string | null;
};

type LecturerStatus = 'pending' | 'active' | 'rejected' | 'suspended' | 'revoked';

type LecturerRegisterResponse = {
  ok: boolean;
  message: string;
  lecturer_status: LecturerStatus;
  lecturer_profile: {
    id: string;
    user_id: string;
    university_id: string;
    university_name?: string | null;
    title: string;
    full_name: string;
    email: string;
    phone_number: string;
    status: LecturerStatus;
  };
};

type FormState = {
  email: string;
  password: string;
  confirmPassword: string;
  university_id: string;
  title: string;
  full_name: string;
  phone_number: string;
};

const INITIAL_FORM_STATE: FormState = {
  email: '',
  password: '',
  confirmPassword: '',
  university_id: '',
  title: '',
  full_name: '',
  phone_number: '',
};

const LECTURER_TITLES = ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof', 'Pharm', 'Pharm Dr'] as const;

const STEPS = [
  'Select University',
  'Lecturer Details',
  'Account Details',
  'Review & Submit',
  'Pending Approval',
] as const;

function readErrorMessage(raw: unknown, fallback: string): string {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const detail = 'detail' in raw ? raw.detail : null;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  const message = 'message' in raw ? raw.message : null;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  return fallback;
}

function normalizeField(value: string): string {
  return value.trim();
}

function isValidEmail(value: string): boolean {
  const normalized = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export default function LecturerRegistrationPage() {
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [universities, setUniversities] = useState<University[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM_STATE);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState<AuthMessageType>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPhoneTooltip, setShowPhoneTooltip] = useState(false);
  const [resolvedStatus, setResolvedStatus] = useState<LecturerStatus | null>(null);
  const [resolvedUniversityName, setResolvedUniversityName] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    let active = true;

    const loadUniversities = async () => {
      try {
        setIsLoadingPage(true);
        setLoadError(null);

        const universitiesResponse = await api.get('/universities');
        if (!universitiesResponse.ok) {
          const raw = await universitiesResponse.json().catch(() => null);
          throw new Error(readErrorMessage(raw, 'Unable to load universities right now. Please try again.'));
        }

        const universitiesData = (await universitiesResponse.json()) as University[];
        if (!active) {
          return;
        }

        setUniversities(universitiesData);
      } catch (error) {
        if (!active) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : 'Unable to load lecturer registration right now.');
      } finally {
        if (active) {
          setIsLoadingPage(false);
        }
      }
    };

    void loadUniversities();

    return () => {
      active = false;
    };
  }, []);

  const selectedUniversity = useMemo(
    () => universities.find((university) => university.id === form.university_id) || null,
    [form.university_id, universities],
  );

  const hasNoUniversities = universities.length === 0;
  const isPendingState = resolvedStatus === 'pending' || step === 4;
  const isActiveState = resolvedStatus === 'active';

  const canContinueFromStepOne = form.university_id.length > 0;
  const canContinueFromStepTwo =
    normalizeField(form.title).length > 0 &&
    normalizeField(form.full_name).length > 0 &&
    normalizeField(form.phone_number).length > 0;
  const canContinueFromStepThree =
    isValidEmail(form.email) &&
    form.password.length > 0 &&
    form.confirmPassword.length > 0 &&
    form.password === form.confirmPassword;

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const goToNextStep = () => {
    if (step === 0 && (!canContinueFromStepOne || hasNoUniversities)) {
      return;
    }
    if (step === 1 && !canContinueFromStepTwo) {
      return;
    }
    if (step === 2 && !canContinueFromStepThree) {
      return;
    }
    setStep((current) => Math.min(current + 1, 4));
  };

  const goToPreviousStep = () => {
    setStep((current) => Math.max(current - 1, 0));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await api.post('/lecturer/register', {
        email: normalizeField(form.email).toLowerCase(),
        password: form.password,
        university_id: normalizeField(form.university_id),
        title: normalizeField(form.title),
        full_name: normalizeField(form.full_name),
        phone_number: normalizeField(form.phone_number),
      });

      const payload = (await response.json().catch(() => null)) as LecturerRegisterResponse | { detail?: string; message?: string } | null;
      if (!response.ok) {
        setMessage({
          type: 'error',
          text: readErrorMessage(payload, 'Unable to submit lecturer registration right now. Please try again.'),
        });
        return;
      }

      const result = payload as LecturerRegisterResponse;
      setResolvedStatus(result.lecturer_status);
      setResolvedUniversityName(result.lecturer_profile.university_name || selectedUniversity?.name || null);
      setMessage({
        type: 'success',
        text: result.message || 'Your lecturer registration has been submitted for review.',
      });

      setForm((current) => ({
        ...current,
        university_id: result.lecturer_profile.university_id,
        title: result.lecturer_profile.title,
        full_name: result.lecturer_profile.full_name,
        phone_number: result.lecturer_profile.phone_number || '',
        email: result.lecturer_profile.email,
        password: '',
        confirmPassword: '',
      }));

      if (result.lecturer_status === 'pending' || result.lecturer_status === 'active') {
        setStep(4);
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unable to submit lecturer registration right now. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-background px-8 py-10 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Preparing lecturer registration...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative h-14 w-14 overflow-hidden rounded-2xl shadow-sm">
              <Image src="/icon-192x192.png" alt="PansGPT" fill sizes="56px" className="object-cover" />
            </div>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary">PansGPT Lecturer</p>
          </div>

          <div className="rounded-3xl border border-border/70 bg-background p-6 shadow-sm sm:p-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">PansGPT Lecturer</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Create your lecturer access request. Your profile will be reviewed before activation.
            </p>
            <p className="mt-4 text-[15px] text-muted-foreground">{loadError}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => window.location.reload()} className={PRIMARY_BUTTON_CLASS_NAME.replace('w-full ', 'sm:w-auto ')}>
                Retry
              </button>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-3.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-secondary"
              >
                Already approved? Log in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 sm:px-6">
      <div className="w-full max-w-md auth-fade-up-delayed">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative h-14 w-14 overflow-hidden rounded-2xl shadow-sm">
            <Image src="/icon-192x192.png" alt="PansGPT" fill sizes="56px" className="object-cover" />
          </div>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary">PansGPT Lecturer</p>
          <p className="mt-3 max-w-sm text-[15px] text-muted-foreground">Create your lecturer access request.</p>
        </div>

        <div className="rounded-3xl border border-border/70 bg-background p-6 shadow-sm sm:p-8">
          {!isActiveState && (
            <div className="mb-6">
              <div className="flex items-center gap-2">
                {STEPS.map((label, index) => {
                  const isActive = index === step;
                  const isDone = index < step;

                  return (
                    <div key={label} className="flex-1">
                      <div className="h-1 overflow-hidden rounded-full bg-surface-tertiary">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isDone ? 'w-full bg-primary' : isActive ? 'w-2/3 bg-primary' : 'w-0 bg-border'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {message && !isPendingState && !isActiveState ? <AuthMessage message={message} /> : null}

          {isActiveState && (
            <div className="space-y-4 animate-in slide-in-from-right duration-300">
              <div className="rounded-2xl border border-border bg-input-background px-4 py-4">
                <h2 className="text-lg font-bold text-foreground">Lecturer access already active</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Your lecturer access is already active. Use the main login page to continue.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-3.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-secondary"
              >
                Already approved? Log in
              </Link>
            </div>
          )}

          {isPendingState && !isActiveState && (
            <div className="space-y-4 animate-in slide-in-from-right duration-300">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Check your email to verify your account.</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      After verification, your lecturer profile will still need admin approval before access is activated.
                    </p>
                    {resolvedUniversityName && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        University: <span className="font-semibold text-foreground">{resolvedUniversityName}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-3.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-secondary"
              >
                Already approved? Log in
              </Link>
            </div>
          )}

          {!isPendingState && !isActiveState && (
            <div className="space-y-6">
              {step === 0 && (
                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Step 1: Select University</h2>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-foreground">University</label>
                    {hasNoUniversities ? (
                      <div className="rounded-2xl border border-border bg-input-background px-4 py-4">
                        <p className="text-sm leading-6 text-muted-foreground">
                          No active universities are available yet. Please contact the PansGPT admin.
                        </p>
                      </div>
                    ) : (
                      <>
                        <select
                          autoFocus
                          value={form.university_id}
                          onChange={(event) => updateField('university_id', event.target.value)}
                          className={`${INPUT_CLASS_NAME} appearance-none`}
                        >
                          <option value="">Select University</option>
                          {universities.map((university) => (
                            <option key={university.id} value={university.id}>
                              {university.name}
                              {university.short_name ? ` (${university.short_name})` : ''}
                            </option>
                          ))}
                        </select>
                        {selectedUniversity && (
                          <p className="text-xs text-muted-foreground">
                            {selectedUniversity.state ? `${selectedUniversity.state}, ` : ''}
                            {selectedUniversity.country || 'Nigeria'}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <button onClick={goToNextStep} disabled={!canContinueFromStepOne || hasNoUniversities} className={PRIMARY_BUTTON_CLASS_NAME}>
                    Continue
                  </button>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Step 2: Lecturer Details</h2>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-foreground">Title</label>
                      <select
                        autoFocus
                        value={form.title}
                        onChange={(event) => updateField('title', event.target.value)}
                        className={`${INPUT_CLASS_NAME} appearance-none`}
                      >
                        <option value="">Select title</option>
                        {LECTURER_TITLES.map((title) => (
                          <option key={title} value={title}>
                            {title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-foreground">Full name</label>
                      <input
                        type="text"
                        value={form.full_name}
                        onChange={(event) => updateField('full_name', event.target.value)}
                        className={INPUT_CLASS_NAME}
                        placeholder="e.g. Adaeze Okonkwo"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold text-foreground">Phone Number</label>
                      <button
                        type="button"
                        aria-label="Phone number help"
                        onMouseEnter={() => setShowPhoneTooltip(true)}
                        onMouseLeave={() => setShowPhoneTooltip(false)}
                        onFocus={() => setShowPhoneTooltip(true)}
                        onBlur={() => setShowPhoneTooltip(false)}
                        onClick={() => setShowPhoneTooltip((current) => !current)}
                        className="relative inline-flex text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <CircleHelp className="h-4 w-4" />
                        {showPhoneTooltip && (
                          <span className="absolute bottom-[calc(100%+0.7rem)] left-1/2 z-10 w-44 -translate-x-1/2 rounded-2xl border border-border bg-background px-3 py-2 text-center text-xs font-medium leading-5 text-muted-foreground shadow-lg">
                            For urgent lecturer-related updates.
                            <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-border bg-background" />
                          </span>
                        )}
                      </button>
                    </div>
                    <input
                      type="tel"
                      value={form.phone_number}
                      onChange={(event) => updateField('phone_number', event.target.value)}
                      className={INPUT_CLASS_NAME}
                      placeholder="Enter phone number"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={goToPreviousStep} className="rounded-xl border border-border px-4 py-3.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-secondary">
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button onClick={goToNextStep} disabled={!canContinueFromStepTwo} className={PRIMARY_BUTTON_CLASS_NAME.replace('w-full ', 'flex-1 ')}>
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Step 3: Account Details</h2>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-foreground">Email</label>
                    <input
                      type="email"
                      autoFocus
                      value={form.email}
                      onChange={(event) => updateField('email', event.target.value)}
                      className={INPUT_CLASS_NAME}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-foreground">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={(event) => updateField('password', event.target.value)}
                        className={`${INPUT_CLASS_NAME} pr-12`}
                        placeholder="Create a password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((previous) => !previous)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-foreground">Confirm password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={form.confirmPassword}
                        onChange={(event) => updateField('confirmPassword', event.target.value)}
                        className={`${INPUT_CLASS_NAME} pr-12`}
                        placeholder="Confirm your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((previous) => !previous)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {form.confirmPassword && form.password !== form.confirmPassword && (
                      <p className="text-xs text-destructive">Passwords do not match.</p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={goToPreviousStep} className="rounded-xl border border-border px-4 py-3.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-secondary">
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button onClick={goToNextStep} disabled={!canContinueFromStepThree} className={PRIMARY_BUTTON_CLASS_NAME.replace('w-full ', 'flex-1 ')}>
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Step 4: Review & Submit</h2>
                  </div>
                  <div className="space-y-3 rounded-2xl border border-border bg-input-background px-4 py-4">
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Email</p>
                      <p className="text-sm font-medium text-foreground">{normalizeField(form.email) || 'Not provided'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">University</p>
                      <p className="text-sm font-medium text-foreground">{selectedUniversity?.name || 'Not selected'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Title</p>
                      <p className="text-sm font-medium text-foreground">{normalizeField(form.title) || 'Not provided'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Full name</p>
                      <p className="text-sm font-medium text-foreground">{normalizeField(form.full_name) || 'Not provided'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Phone Number</p>
                      <p className="text-sm font-medium text-foreground">{normalizeField(form.phone_number) || 'Not provided'}</p>
                    </div>
                  </div>

                  {/* Terms & Conditions checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer group mt-4">
                    <div className="relative mt-0.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                          agreedToTerms
                            ? 'bg-primary border-primary'
                            : 'border-border bg-surface-primary group-hover:border-primary/60'
                        }`}
                      >
                        {agreedToTerms && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground leading-relaxed text-left">
                      By submitting this request, I agree to PansGPT&apos;s{' '}
                      <Link href="/terms" target="_blank" className="text-primary font-semibold hover:underline">
                        Terms of Service
                      </Link>{' '}
                      (including the Lecturer provisions) and{' '}
                      <Link href="/privacy" target="_blank" className="text-primary font-semibold hover:underline">
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>

                  <div className="flex gap-3">
                    <button onClick={goToPreviousStep} className="rounded-xl border border-border px-4 py-3.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-secondary">
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button onClick={() => void handleSubmit()} disabled={isSubmitting || !agreedToTerms} className={PRIMARY_BUTTON_CLASS_NAME.replace('w-full ', 'flex-1 ')}>
                      {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Submit for review'}
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-1">
                <Link href="/login" className="text-sm font-medium text-primary transition-colors hover:text-primary/80">
                  Already approved? Log in
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
