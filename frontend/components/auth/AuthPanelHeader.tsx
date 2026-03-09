import { ArrowLeft } from 'lucide-react';
import { SIGNUP_STEPS } from './authConstants';
import type { AuthView } from './types';

type AuthPanelHeaderProps = {
  forgotSent: boolean;
  panelSubtitle: string;
  panelTitle: string;
  signupStep: number;
  switchToLogin: () => void;
  view: AuthView;
};

export function AuthPanelHeader({
  forgotSent,
  panelSubtitle,
  panelTitle,
  signupStep,
  switchToLogin,
  view,
}: AuthPanelHeaderProps) {
  return (
    <>
      {view === 'forgot' && !forgotSent && (
        <button onClick={switchToLogin} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 font-medium mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to login
        </button>
      )}

      {view === 'signup' && (
        <div className="mb-6">
          <div className="flex items-center gap-2">
            {SIGNUP_STEPS.map((label, index) => {
              const isActive = index === signupStep;
              const isDone = index < signupStep;

              return (
                <div key={label} className="flex-1">
                  <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isDone ? 'w-full bg-green-500' : isActive ? 'w-2/3 bg-green-500' : 'w-0 bg-slate-200'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-[#0F172A] tracking-tight mb-2">{panelTitle}</h1>
        <p className="text-slate-500 text-[15px]">{panelSubtitle}</p>
      </div>
    </>
  );
}
