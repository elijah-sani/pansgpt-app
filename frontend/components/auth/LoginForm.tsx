import { Eye, EyeOff, Loader2 } from 'lucide-react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { AuthMessage } from './AuthMessage';
import { INPUT_CLASS_NAME, PRIMARY_BUTTON_CLASS_NAME } from './authConstants';
import type { AuthMessage as AuthMessageType } from './types';

type LoginFormProps = {
  loading: boolean;
  loginEmail: string;
  loginPassword: string;
  message: AuthMessageType;
  rememberMe: boolean;
  setLoginEmail: (value: string) => void;
  setLoginPassword: (value: string) => void;
  setRememberMe: (value: boolean) => void;
  setShowLoginPassword: Dispatch<SetStateAction<boolean>>;
  showLoginPassword: boolean;
  switchToForgot: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
};

export function LoginForm({
  loading,
  loginEmail,
  loginPassword,
  message,
  rememberMe,
  setLoginEmail,
  setLoginPassword,
  setRememberMe,
  setShowLoginPassword,
  showLoginPassword,
  switchToForgot,
  onSubmit,
}: LoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-bold text-slate-700">Email address</label>
        <input type="email" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} className={INPUT_CLASS_NAME} placeholder="you@example.com" />
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label className="text-sm font-bold text-slate-700">Password</label>
          <button type="button" onClick={switchToForgot} className="text-sm font-semibold text-green-600 hover:text-green-700 transition-colors">
            Forgot password?
          </button>
        </div>
        <div className="relative">
          <input
            type={showLoginPassword ? 'text' : 'password'}
            required
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            className={`${INPUT_CLASS_NAME} pr-12`}
            placeholder="Enter your password"
          />
          <button
            type="button"
            onClick={() => setShowLoginPassword((previous) => !previous)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showLoginPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>
      <div className="flex items-center">
        <input id="remember-me" type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-4 w-4 text-green-600 border-gray-300 rounded accent-green-600" />
        <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-500">Remember me</label>
      </div>
      <AuthMessage message={message} />
      <button type="submit" disabled={loading} className={PRIMARY_BUTTON_CLASS_NAME}>
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in'}
      </button>

    </form>
  );
}