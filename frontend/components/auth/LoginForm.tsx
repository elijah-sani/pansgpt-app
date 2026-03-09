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
      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-gray-200" />
        <span className="flex-shrink-0 mx-4 text-gray-400 text-xs font-bold uppercase tracking-wider">Or continue with</span>
        <div className="flex-grow border-t border-gray-200" />
      </div>
      <button type="button" className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-[#0F172A] font-bold hover:bg-gray-50 transition-all shadow-sm">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Google
      </button>
    </form>
  );
}
