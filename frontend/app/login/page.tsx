'use client';

import { AuthHero } from '@/components/auth/AuthHero';
import { AuthPanelHeader } from '@/components/auth/AuthPanelHeader';
import { ForgotPasswordSection } from '@/components/auth/ForgotPasswordSection';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupWizard } from '@/components/auth/SignupWizard';
import { useAuthPage } from '@/hooks/useAuthPage';

export default function AuthPage() {
  const {
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
  } = useAuthPage();

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#152012] font-sans text-slate-900 relative">
      <AuthHero
        taglineFading={taglineFading}
        taglineIndex={taglineIndex}
        onSelectTagline={(index) => {
          setTaglineFading(true);
          setTimeout(() => {
            setTaglineIndex(index);
            setTaglineFading(false);
          }, 400);
        }}
      />

      <div className="relative lg:absolute lg:inset-y-0 lg:right-0 lg:ml-auto w-full lg:w-[34%] flex-1 lg:min-h-screen bg-white flex flex-col items-center justify-center p-8 rounded-t-[2.5rem] lg:rounded-l-[3rem] lg:rounded-tr-none overflow-y-auto z-20 shadow-2xl auth-panel-enter">
        <div className="w-full max-w-sm auth-fade-up-delayed">
          <AuthPanelHeader
            forgotSent={forgotSent}
            panelSubtitle={panelSubtitle}
            panelTitle={panelTitle}
            signupStep={signupStep}
            switchToLogin={() => switchView('login')}
            view={view}
          />

          {view === 'login' && (
            <LoginForm
              loading={loading}
              loginEmail={loginEmail}
              loginPassword={loginPassword}
              message={message}
              rememberMe={rememberMe}
              setLoginEmail={setLoginEmail}
              setLoginPassword={setLoginPassword}
              setRememberMe={setRememberMe}
              setShowLoginPassword={setShowLoginPassword}
              showLoginPassword={showLoginPassword}
              switchToForgot={() => switchView('forgot')}
              onSubmit={handleLogin}
            />
          )}

          {view === 'forgot' && (
            <ForgotPasswordSection
              forgotEmail={forgotEmail}
              forgotSent={forgotSent}
              loading={loading}
              message={message}
              setForgotEmail={setForgotEmail}
              setForgotSent={setForgotSent}
              switchToLogin={() => switchView('login')}
              onSubmit={handleForgotPassword}
            />
          )}

          {view === 'signup' && (
            <SignupWizard
              formData={formData}
              loading={loading}
              message={message}
              nextStep={nextStep}
              prevStep={prevStep}
              resendCooldown={resendCooldown}
              resendSignupEmail={resendSignupEmail}
              setFormData={setFormData}
              setShowSignupPassword={setShowSignupPassword}
              showSignupPassword={showSignupPassword}
              signupStep={signupStep}
              submitSignup={handleSignupSubmit}
            />
          )}

          {view !== 'forgot' && (
            <div className="mt-8">
              <p className="text-center text-sm text-slate-500 font-medium">
                {view === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
                <button onClick={() => switchView(view === 'signup' ? 'login' : 'signup')} className="font-bold text-green-600 hover:text-green-700 transition-colors">
                  {view === 'signup' ? 'Sign in' : 'Sign up for free'}
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
