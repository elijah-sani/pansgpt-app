'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TAGLINES } from '@/components/auth/authConstants';
import type { AuthMessage, AuthView, SignupFormData } from '@/components/auth/types';
import { supabase } from '@/lib/supabase';

const INITIAL_FORM_DATA: SignupFormData = {
  firstName: '',
  otherNames: '',
  university: '',
  level: '',
  email: '',
  password: '',
};

function getFriendlyAuthError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const normalizedMessage = error.message.trim().toLowerCase();
  if (
    normalizedMessage === 'failed to fetch' ||
    normalizedMessage.includes('networkerror') ||
    normalizedMessage.includes('network request failed') ||
    normalizedMessage.includes('load failed')
  ) {
    return 'Unable to connect right now. Please check your internet connection and try again.';
  }

  return error.message || fallback;
}

export function useAuthPage() {
  const router = useRouter();

  const [view, setView] = useState<AuthView>('login');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<AuthMessage>(null);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [taglineFading, setTaglineFading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupStep, setSignupStep] = useState(0);
  const [formData, setFormData] = useState<SignupFormData>(INITIAL_FORM_DATA);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Read URL params and hash on mount to show friendly messages
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);

    // ?confirmed=true — email just verified, prompt user to sign in
    if (searchParams.get('confirmed') === 'true') {
      setMessage({ type: 'success', text: '✅ Email confirmed! You can now sign in.' });
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }

    // ?error=callback_failed — something went wrong in the callback
    if (searchParams.get('error') === 'callback_failed') {
      setMessage({ type: 'error', text: 'Confirmation failed. Please try signing up again.' });
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }

    // #error= hash — Supabase error in hash fragment (e.g. expired OTP)
    const hash = window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash.replace('#', ''));
    const error = params.get('error');
    const errorCode = params.get('error_code');
    const errorDescription = params.get('error_description');

    if (error) {
      let friendlyMessage = errorDescription?.replace(/\+/g, ' ') ||
        'Something went wrong. Please try again.';

      if (errorCode === 'otp_expired') {
        friendlyMessage = 'Your confirmation link has expired. Please sign up again or request a new confirmation email.';
      } else if (errorCode === 'access_denied') {
        friendlyMessage = 'This link is no longer valid. Please try signing in or request a new link.';
      }

      setMessage({ type: 'error', text: friendlyMessage });
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTaglineFading(true);
      setTimeout(() => {
        setTaglineIndex((index) => (index + 1) % TAGLINES.length);
        setTaglineFading(false);
      }, 400);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timer = setTimeout(() => setResendCooldown((count) => count - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const switchView = (nextView: AuthView) => {
    setMessage(null);
    setView(nextView);

    if (nextView === 'signup') {
      setSignupStep(0);
    }

    if (nextView === 'forgot') {
      setForgotEmail('');
      setForgotSent(false);
    }
  };

  const nextStep = () => {
    setSignupStep((step) => step + 1);
    setMessage(null);
  };

  const prevStep = () => {
    setSignupStep((step) => step - 1);
    setMessage(null);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        throw error;
      }

      router.push('/main');

    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: getFriendlyAuthError(error, 'Unable to sign in right now. Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: `${formData.firstName} ${formData.otherNames}`.trim(),
            first_name: formData.firstName,
            other_names: formData.otherNames,
            university: formData.university,
            level: formData.level,
          },
        },
      });

      if (error) {
        throw error;
      }

      setMessage({
        type: 'success',
        text: 'Account created! Check your email to confirm.',
      });
      setResendCooldown(60);
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: getFriendlyAuthError(error, 'Unable to sign up right now. Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      setForgotSent(true);
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: getFriendlyAuthError(error, 'Unable to send the reset email right now. Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  };

  const resendSignupEmail = async () => {
    setResendCooldown(60);
    setLoading(true);

    try {
      await supabase.auth.resend({
        type: 'signup',
        email: formData.email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      setMessage({
        type: 'success',
        text: 'Confirmation email resent! Check your inbox.',
      });
    } finally {
      setLoading(false);
    }
  };

  const panelTitle =
    view === 'forgot'
      ? forgotSent
        ? 'Check your email'
        : 'Forgot password?'
      : view === 'signup'
        ? signupStep === 0
          ? "Let's get started"
          : signupStep === 1
            ? 'Your School'
            : signupStep === 2
              ? 'Your Level'
              : 'Secure Account'
        : 'Welcome Back';

  const panelSubtitle =
    view === 'forgot'
      ? forgotSent
        ? `We sent a reset link to ${forgotEmail}`
        : "Enter your email and we'll send a reset link."
      : view === 'signup'
        ? signupStep === 0
          ? 'First, what should we call you?'
          : signupStep === 1
            ? "Tell us where you're studying."
            : signupStep === 2
              ? 'Help us tailor your study materials.'
              : 'Almost done! Set your login details.'
        : 'Please enter your details to access your dashboard.';

  return {
    forgotEmail,
    forgotSent,
    formData,
    handleForgotPassword,
    handleLogin,
    handleSignupSubmit,
    loading,
    loginEmail,
    loginPassword,
    message,
    nextStep,
    panelSubtitle,
    panelTitle,
    prevStep,
    rememberMe,
    resendCooldown,
    resendSignupEmail,
    setForgotEmail,
    setForgotSent,
    setFormData,
    setLoginEmail,
    setLoginPassword,
    setRememberMe,
    setShowLoginPassword,
    setShowSignupPassword,
    setTaglineFading,
    setTaglineIndex,
    showLoginPassword,
    showSignupPassword,
    signupStep,
    switchView,
    taglineFading,
    taglineIndex,
    view,
  };
}