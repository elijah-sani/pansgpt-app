import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { AuthMessage } from './AuthMessage';
import { INPUT_CLASS_NAME, LEVELS, NIGERIAN_UNIVERSITIES, PRIMARY_BUTTON_CLASS_NAME } from './authConstants';
import type { AuthMessage as AuthMessageType, SignupFormData } from './types';

type SignupWizardProps = {
  formData: SignupFormData;
  loading: boolean;
  message: AuthMessageType;
  nextStep: () => void;
  prevStep: () => void;
  resendCooldown: number;
  resendSignupEmail: () => Promise<void>;
  setFormData: Dispatch<SetStateAction<SignupFormData>>;
  setShowSignupPassword: Dispatch<SetStateAction<boolean>>;
  showSignupPassword: boolean;
  signupStep: number;
  submitSignup: () => Promise<void>;
};

export function SignupWizard({
  formData,
  loading,
  message,
  nextStep,
  prevStep,
  resendCooldown,
  resendSignupEmail,
  setFormData,
  setShowSignupPassword,
  showSignupPassword,
  signupStep,
  submitSignup,
}: SignupWizardProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  return (
    <div className="space-y-6">
      {signupStep === 0 && (
        <div className="space-y-4 animate-in slide-in-from-right duration-300">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700">First Name</label>
            <input type="text" autoFocus value={formData.firstName} onChange={(event) => setFormData((current) => ({ ...current, firstName: event.target.value }))} onKeyDown={(event) => event.key === 'Enter' && formData.firstName && nextStep()} className={INPUT_CLASS_NAME} placeholder="e.g. Victor" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700">Other Names</label>
            <input type="text" value={formData.otherNames} onChange={(event) => setFormData((current) => ({ ...current, otherNames: event.target.value }))} onKeyDown={(event) => event.key === 'Enter' && formData.firstName && nextStep()} className={INPUT_CLASS_NAME} placeholder="e.g. Oluwaseun" />
          </div>
          <button onClick={nextStep} disabled={!formData.firstName} className={PRIMARY_BUTTON_CLASS_NAME}>Continue</button>
        </div>
      )}
      {signupStep === 1 && (
        <div className="space-y-4 animate-in slide-in-from-right duration-300">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700">University</label>
            <select autoFocus value={formData.university} onChange={(event) => setFormData((current) => ({ ...current, university: event.target.value }))} className={`${INPUT_CLASS_NAME} appearance-none`}>
              <option value="">Select University</option>
              {NIGERIAN_UNIVERSITIES.map((university) => <option key={university} value={university}>{university}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={prevStep} className="px-4 py-3.5 rounded-xl border border-gray-200 text-slate-600 hover:bg-gray-50 font-bold text-sm"><ArrowLeft className="w-4 h-4" /></button>
            <button onClick={nextStep} disabled={!formData.university} className={PRIMARY_BUTTON_CLASS_NAME.replace('w-full ', 'flex-1 ')}>Continue</button>
          </div>
        </div>
      )}
      {signupStep === 2 && (
        <div className="space-y-4 animate-in slide-in-from-right duration-300">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700">Level</label>
            <select autoFocus value={formData.level} onChange={(event) => setFormData((current) => ({ ...current, level: event.target.value }))} className={`${INPUT_CLASS_NAME} appearance-none`}>
              <option value="">Select Level</option>
              {LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={prevStep} className="px-4 py-3.5 rounded-xl border border-gray-200 text-slate-600 hover:bg-gray-50 font-bold text-sm"><ArrowLeft className="w-4 h-4" /></button>
            <button onClick={nextStep} disabled={!formData.level} className={PRIMARY_BUTTON_CLASS_NAME.replace('w-full ', 'flex-1 ')}>Continue</button>
          </div>
        </div>
      )}
      {signupStep === 3 && (
        <div className="space-y-4 animate-in slide-in-from-right duration-300">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-slate-700">Email</label>
              <input type="email" autoFocus value={formData.email} onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))} className={INPUT_CLASS_NAME} placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-slate-700">Password</label>
              <div className="relative">
                <input
                  type={showSignupPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(event) => setFormData((current) => ({ ...current, password: event.target.value }))}
                  className={`${INPUT_CLASS_NAME} pr-12`}
                  placeholder="Create a password"
                />
                <button
                  type="button"
                  onClick={() => setShowSignupPassword((previous) => !previous)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showSignupPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Terms & Conditions checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${agreedToTerms
                    ? 'bg-[#00C853] border-[#00C853]'
                    : 'border-gray-300 bg-white group-hover:border-green-400'
                  }`}
              >
                {agreedToTerms && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-xs text-slate-500 leading-relaxed">
              By signing up, I agree to PansGPT&apos;s{' '}
              <a href="/terms" target="_blank" className="text-green-600 font-semibold hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" className="text-green-600 font-semibold hover:underline">
                Privacy Policy
              </a>
            </span>
          </label>

          <AuthMessage message={message} />
          {message?.type === 'success' && (
            <p className="text-xs text-slate-400 text-center">
              Didn&apos;t get it?{' '}
              {resendCooldown > 0 ? (
                <span className="text-slate-400">Resend in {resendCooldown}s</span>
              ) : (
                <button type="button" disabled={loading} onClick={resendSignupEmail} className="text-green-600 font-bold hover:underline disabled:opacity-50">
                  Resend it
                </button>
              )}
            </p>
          )}
          <div className="flex gap-3">
            <button onClick={prevStep} className="px-4 py-3.5 rounded-xl border border-gray-200 text-slate-600 hover:bg-gray-50 font-bold text-sm"><ArrowLeft className="w-4 h-4" /></button>
            <button
              onClick={submitSignup}
              disabled={loading || !formData.email || !formData.password || !agreedToTerms}
              className={PRIMARY_BUTTON_CLASS_NAME.replace('w-full ', 'flex-1 ')}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}