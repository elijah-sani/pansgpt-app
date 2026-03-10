'use client';

import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthHero } from '@/components/auth/AuthHero';
import { AuthPanelHeader } from '@/components/auth/AuthPanelHeader';
import { ForgotPasswordSection } from '@/components/auth/ForgotPasswordSection';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupWizard } from '@/components/auth/SignupWizard';
import { TAGLINES } from '@/components/auth/authConstants';
import { useAuthPage } from '@/hooks/useAuthPage';
import { MobileAuthLayout } from '@/components/auth/MobileAuthLayout';

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
      {/* Mobile layout */}
      <MobileAuthLayout
        forgotEmail={forgotEmail}
        forgotSent={forgotSent}
        formData={formData}
        handleForgotPassword={handleForgotPassword}
        handleLogin={handleLogin}
        handleSignupSubmit={handleSignupSubmit}
        loading={loading}
        loginEmail={loginEmail}
        loginPassword={loginPassword}
        message={message}
        nextStep={nextStep}
        panelSubtitle={panelSubtitle}
        prevStep={prevStep}
        rememberMe={rememberMe}
        resendCooldown={resendCooldown}
        resendSignupEmail={resendSignupEmail}
        setForgotEmail={setForgotEmail}
        setForgotSent={setForgotSent}
        setFormData={setFormData}
        setLoginEmail={setLoginEmail}
        setLoginPassword={setLoginPassword}
        setRememberMe={setRememberMe}
        setShowLoginPassword={setShowLoginPassword}
        setShowSignupPassword={setShowSignupPassword}
        showLoginPassword={showLoginPassword}
        showSignupPassword={showSignupPassword}
        signupStep={signupStep}
        switchView={switchView}
        taglineIndex={taglineIndex}
        view={view}
      />
      {/* Desktop-only placeholder to keep the lg:hidden div out */}
      <div className="lg:hidden hidden flex min-h-screen flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="relative h-14 w-14 overflow-hidden rounded-2xl shadow-lg">
            <Image src="/icon-192x192.png" alt="PansGPT" fill sizes="56px" className="object-cover" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">PansGPT</h1>
          <div className="mt-3 min-h-[20px]">
            <AnimatePresence mode="wait">
              <motion.p
                key={taglineIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="text-sm text-white/60"
              >
                {TAGLINES[taglineIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="fixed inset-x-0 bottom-0 z-20 rounded-t-[2rem] bg-white px-6 pt-8 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] shadow-2xl"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="text-xl font-bold text-slate-900">
                {view === 'login' ? 'Welcome back' : view === 'signup' ? 'Create account' : 'Reset password'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{panelSubtitle}</p>

              <div className="mt-6">
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
              </div>

              {view !== 'forgot' && (
                <div className="mt-6">
                  <p className="text-center text-sm text-slate-500 font-medium">
                    {view === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
                    <button
                      onClick={() => switchView(view === 'signup' ? 'login' : 'signup')}
                      className="font-bold text-green-600 hover:text-green-700 transition-colors"
                    >
                      {view === 'signup' ? 'Sign in' : 'Sign up for free'}
                    </button>
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Desktop layout (unchanged) */}
      <div className="hidden lg:flex flex-1">
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
                  <button
                    onClick={() => switchView(view === 'signup' ? 'login' : 'signup')}
                    className="font-bold text-green-600 hover:text-green-700 transition-colors"
                  >
                    {view === 'signup' ? 'Sign in' : 'Sign up for free'}
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}