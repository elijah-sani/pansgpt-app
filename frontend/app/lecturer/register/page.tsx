'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  GraduationCap,
  AlertCircle,
  ShieldX,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface FormState {
  fullName: string;
  department: string;
  email: string;
  password: string;
  confirmPassword: string;
}

type PageStatus = 'validating' | 'invalid' | 'ready' | 'submitting' | 'error';

const DEPARTMENTS = [
  'Pharmaceutical Chemistry',
  'Pharmaceutical Microbiology',
  'Pharmaceutical Technology',
  'Pharmacognosy',
  'Clinical Pharmacy',
  'Pharmaceutics',
  'Pharmacology',
] as const;

// ---------------------------------------------------------------------------
// Shared input style — all values via CSS variables per design system
// ---------------------------------------------------------------------------
const inputBase: React.CSSProperties = {
  width: '100%',
  height: '2.5rem',           // h-10
  padding: '0 0.75rem',       // px-3
  borderRadius: '0.375rem',   // rounded-md
  border: '1px solid var(--border)',
  background: 'var(--input)',
  color: 'var(--foreground)',
  fontSize: '0.875rem',       // text-sm
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
};

const inputFocus = (el: HTMLElement) => {
  el.style.borderColor = 'var(--ring)';
  el.style.boxShadow = '0 0 0 2px var(--ring)';
};

const inputBlur = (el: HTMLElement) => {
  el.style.borderColor = 'var(--border)';
  el.style.boxShadow = 'none';
};

// ---------------------------------------------------------------------------
// Label component — uppercase tracking per design system
// ---------------------------------------------------------------------------
function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block',
        fontSize: '0.75rem',       // text-xs
        fontWeight: 500,            // font-medium
        color: 'var(--muted-foreground)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',   // tracking-wide
        marginBottom: '0.375rem',  // mb-1.5
      }}
    >
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Full-viewport spinner (validating state)
// ---------------------------------------------------------------------------
function ValidatingState() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
      }}
    >
      <>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              border: '2px solid var(--border)',
              borderTopColor: 'var(--primary)',
              animation: 'spin 0.7s linear infinite',
            }}
          />
          <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Verifying your invite…</p>
        </div>
      </>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invalid invite — full page, no card
// ---------------------------------------------------------------------------
function InvalidInviteState() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}
      >
        {/* Brand mark above */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <GraduationCap size={22} color="var(--primary)" strokeWidth={2} />
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: 'var(--foreground)',
            }}
          >
            PansGPT Faculty
          </span>
        </div>

        {/* Error icon */}
        <div
          style={{
            width: '5rem',
            height: '5rem',
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShieldX size={28} color="var(--destructive)" strokeWidth={1.5} />
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            fontSize: '1.125rem',     // text-lg
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          This registration link is no longer active
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', maxWidth: '28rem', lineHeight: 1.6, margin: 0 }}>
          Contact your administrator for a new invite link.
        </p>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main inner page — must be wrapped in Suspense (uses useSearchParams)
// ---------------------------------------------------------------------------
function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code') ?? '';

  const [status, setStatus] = useState<PageStatus>('validating');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState<FormState>({
    fullName: '',
    department: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  // Validate invite code on mount — preserved exactly from original
  const hasValidated = useState(false);
  void hasValidated;

  const [, setValidateDone] = useState(false);

  // Validate once on mount
  useState(() => {
    if (!code) {
      setStatus('invalid');
      return;
    }
    (async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
        const res = await fetch(`${apiBase}/lecturer/register/validate?code=${encodeURIComponent(code)}`);
        if (!res.ok) throw new Error('Network error');
        const data = (await res.json()) as { valid: boolean };
        setStatus(data.valid ? 'ready' : 'invalid');
      } catch {
        setStatus('invalid');
      } finally {
        setValidateDone(true);
      }
    })();
  });

  // ---- form helpers ----
  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');

    if (!form.fullName.trim()) return setErrorMsg('Please enter your full name.');
    if (!form.department) return setErrorMsg('Please select your department.');
    if (!form.email.trim()) return setErrorMsg('Please enter your email address.');
    if (form.password.length < 8) return setErrorMsg('Password must be at least 8 characters.');
    if (form.password !== form.confirmPassword) return setErrorMsg('Passwords do not match.');

    setStatus('submitting');

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
      const res = await fetch(`${apiBase}/lecturer/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          full_name: form.fullName.trim(),
          department: form.department,
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });

      const data = (await res.json()) as {
        access_token?: string | null;
        refresh_token?: string | null;
        detail?: string;
        message?: string;
      };

      if (!res.ok) {
        const msg =
          res.status === 409
            ? 'An account with this email already exists.'
            : (data.detail ?? data.message ?? 'Registration failed. Please try again.');
        setErrorMsg(msg);
        setStatus('error');
        return;
      }

      if (data.access_token && data.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
      }

      router.replace('/lecturer/welcome');
    } catch {
      setErrorMsg('A network error occurred. Please check your connection and try again.');
      setStatus('error');
    }
  };

  // ---- render states ----
  if (status === 'validating') return <ValidatingState />;
  if (status === 'invalid') return <InvalidInviteState />;

  const isSubmitting = status === 'submitting';
  const invitePreview = code.length > 8 ? `${code.slice(0, 8)}…` : code;

  return (
    <>
      {/* Spin keyframe for loading indicator */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Full-viewport centering container */}
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--background)',
          padding: '2rem 1rem',
        }}
      >
        {/* ── Above-card brand mark ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.375rem',
            marginBottom: '1.5rem',
          }}
        >
          <GraduationCap size={28} color="var(--primary)" strokeWidth={2} aria-hidden="true" />
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: 'var(--foreground)',
              letterSpacing: '0.01em',
            }}
          >
            PansGPT Lecturer
          </span>
        </div>

        {/* ── Auth card ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{
            width: '100%',
            maxWidth: '400px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',   // rounded-lg
            padding: '2rem',          // p-8
          }}
        >
          {/* Card heading */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h1
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                fontSize: '1.25rem',   // text-xl
                color: 'var(--foreground)',
                margin: '0 0 0.375rem 0',
              }}
            >
              Create your account
            </h1>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--muted-foreground)',
                lineHeight: 1.55,
                margin: '0 0 0.875rem 0',
              }}
            >
              You've been invited to join PansGPT Lecturer Portal
            </p>


          </div>

          {/* Error banner */}
          {(status === 'error' || errorMsg) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              role="alert"
              aria-live="polite"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.375rem',
                background: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--destructive) 20%, transparent)',
                marginBottom: '1.25rem',
              }}
            >
              <AlertCircle
                size={16}
                strokeWidth={2}
                style={{ flexShrink: 0, marginTop: '0.1rem', color: 'var(--destructive)' }}
                aria-hidden="true"
              />
              <p style={{ fontSize: '0.875rem', color: 'var(--destructive)', lineHeight: 1.5, margin: 0 }}>
                {errorMsg}
              </p>
            </motion.div>
          )}

          {/* Registration form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>

            {/* ── Full Name ── */}
            <div>
              <FieldLabel htmlFor="fullName">Full Name</FieldLabel>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                placeholder="Dr. Jane Smith"
                value={form.fullName}
                onChange={set('fullName')}
                required
                disabled={isSubmitting}
                style={inputBase}
                onFocus={(e) => inputFocus(e.currentTarget)}
                onBlur={(e) => inputBlur(e.currentTarget)}
              />
            </div>

            {/* ── Department ── */}
            <div>
              <FieldLabel htmlFor="department">Department</FieldLabel>
              <select
                id="department"
                value={form.department}
                onChange={set('department')}
                required
                disabled={isSubmitting}
                style={{
                  ...inputBase,
                  color: form.department ? 'var(--foreground)' : 'var(--muted-foreground)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  appearance: 'auto',
                }}
                onFocus={(e) => inputFocus(e.currentTarget)}
                onBlur={(e) => inputBlur(e.currentTarget)}
              >
                <option value="" disabled>Select department</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* ── Email Address ── */}
            <div>
              <FieldLabel htmlFor="email">Email Address</FieldLabel>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="jane.smith@university.edu.ng"
                value={form.email}
                onChange={set('email')}
                required
                disabled={isSubmitting}
                style={inputBase}
                onFocus={(e) => inputFocus(e.currentTarget)}
                onBlur={(e) => inputBlur(e.currentTarget)}
              />
            </div>

            {/* ── Password ── */}
            <div>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={set('password')}
                  required
                  minLength={8}
                  disabled={isSubmitting}
                  style={{ ...inputBase, paddingRight: '2.75rem' }}
                  onFocus={(e) => inputFocus(e.currentTarget)}
                  onBlur={(e) => inputBlur(e.currentTarget)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    color: 'var(--muted-foreground)',
                    lineHeight: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                Minimum 8 characters
              </p>
            </div>

            {/* ── Confirm Password ── */}
            <div>
              <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
              <div style={{ position: 'relative' }}>
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  value={form.confirmPassword}
                  onChange={set('confirmPassword')}
                  required
                  disabled={isSubmitting}
                  style={{ ...inputBase, paddingRight: '2.75rem' }}
                  onFocus={(e) => inputFocus(e.currentTarget)}
                  onBlur={(e) => inputBlur(e.currentTarget)}
                />
                <button
                  type="button"
                  aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                  onClick={() => setShowConfirm((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    color: 'var(--muted-foreground)',
                    lineHeight: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* ── CTA button ── */}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                marginTop: '0.25rem',
                width: '100%',
                height: '2.5rem',         // h-10
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                borderRadius: '0.375rem', // rounded-md
                border: 'none',
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,           // font-medium
                fontSize: '0.875rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.5 : 1,
                transition: 'background-color 0.2s, opacity 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 85%, black)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--primary)';
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    size={16}
                    strokeWidth={2}
                    style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  Creating account…
                </>
              ) : (
                'Create Lecturer Account'
              )}
            </button>
          </form>

          {/* Below-card sign-in link */}
          <p
            style={{
              marginTop: '1.25rem',
              textAlign: 'center',
              fontSize: '0.75rem',   // text-xs
              color: 'var(--muted-foreground)',
            }}
          >
            Already registered?{' '}
            <Link
              href="/lecturer/login"
              style={{
                color: 'var(--primary)',
                textDecoration: 'none',
                fontWeight: 500,
                transition: 'text-decoration 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page export — Suspense boundary required for useSearchParams
// ---------------------------------------------------------------------------
export default function LecturerRegisterPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--background)',
          }}
        >
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div
            style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              border: '2px solid var(--border)',
              borderTopColor: 'var(--primary)',
              animation: 'spin 0.7s linear infinite',
            }}
          />
        </div>
      }
    >
      <RegisterPageInner />
    </Suspense>
  );
}
