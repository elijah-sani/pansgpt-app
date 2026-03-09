import { Mail, Loader2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { AuthMessage } from './AuthMessage';
import { INPUT_CLASS_NAME, PRIMARY_BUTTON_CLASS_NAME } from './authConstants';
import type { AuthMessage as AuthMessageType } from './types';

type ForgotPasswordSectionProps = {
  forgotEmail: string;
  forgotSent: boolean;
  loading: boolean;
  message: AuthMessageType;
  setForgotEmail: (value: string) => void;
  setForgotSent: (value: boolean) => void;
  switchToLogin: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
};

export function ForgotPasswordSection({
  forgotEmail,
  forgotSent,
  loading,
  message,
  setForgotEmail,
  setForgotSent,
  switchToLogin,
  onSubmit,
}: ForgotPasswordSectionProps) {
  return (
    <div className="space-y-5">
      {!forgotSent ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700">Email address</label>
            <input type="email" required autoFocus value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} className={INPUT_CLASS_NAME} placeholder="you@example.com" />
          </div>
          <AuthMessage message={message} />
          <button type="submit" disabled={loading || !forgotEmail} className={PRIMARY_BUTTON_CLASS_NAME}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send reset link'}
          </button>
        </form>
      ) : (
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto">
            <Mail className="w-7 h-7 text-green-500" />
          </div>
          <p className="text-slate-500 text-sm leading-relaxed">
            Check your spam folder too. Link expires in 1 hour.
          </p>
          <p className="text-xs text-slate-400">
            Didn&apos;t get it?{' '}
            <button onClick={() => setForgotSent(false)} className="text-green-600 font-bold hover:underline">Try again</button>
          </p>
          <button onClick={switchToLogin} className="w-full py-3 rounded-xl border border-gray-200 text-slate-700 font-bold text-sm hover:bg-gray-50 transition-colors">
            Back to login
          </button>
        </div>
      )}
    </div>
  );
}
