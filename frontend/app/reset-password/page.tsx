'use client';

import { Suspense, useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle2, Lock, Eye, EyeOff } from 'lucide-react';

function ResetPasswordContent() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      // Supabase auto-exchanges the code before component mounts
      // and strips it from the URL — just check if session exists
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
        setMessage(null);
        return;
      }

      // Listen in case exchange is still in progress
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
          setSessionReady(true);
          setMessage(null);
          subscription.unsubscribe();
        }
      });

      setTimeout(() => {
        subscription.unsubscribe();
        setMessage({ type: 'error', text: 'Reset link is invalid or expired. Please request a new one.' });
      }, 5000);
    };

    checkSession();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to reset password.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl">
        {done ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-extrabold text-[#0F172A] mb-2">Password updated!</h2>
            <p className="text-slate-500 text-sm">Redirecting you to login...</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-green-600" />
              </div>
              <h1 className="text-2xl font-extrabold text-[#0F172A] mb-2">Set new password</h1>
              <p className="text-slate-500 text-sm">Choose a strong password for your PansGPT account.</p>
            </div>

            {!sessionReady && (
              <div className="p-4 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium mb-4 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Verifying your reset link...
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium pr-12"
                    placeholder="Min. 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700">Confirm password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                  placeholder="Repeat your password"
                />
              </div>

              {message && (
                <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                  {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
                  <p>{message.text}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !sessionReady || !password || !confirmPassword}
                className="w-full flex items-center justify-center py-3.5 px-4 rounded-xl text-white bg-[#00C853] hover:bg-[#00b54b] transition-all font-bold text-sm shadow-md shadow-green-500/20 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
