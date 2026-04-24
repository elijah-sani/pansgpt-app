'use client';

import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ForgotPasswordSection } from './ForgotPasswordSection';
import { LoginForm } from './LoginForm';
import { SignupWizard } from './SignupWizard';
import { TAGLINES } from './authConstants';
import type { AuthMessage, AuthView, SignupFormData } from './types';

function useTypingAnimation(texts: readonly string[], typingSpeed = 38, pauseDuration = 2400) {
    const [displayText, setDisplayText] = useState('');
    const [textIndex, setTextIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const currentText = texts[textIndex];
        const tick = () => {
            if (!isDeleting) {
                if (displayText.length < currentText.length) {
                    setDisplayText(currentText.slice(0, displayText.length + 1));
                    timeoutRef.current = setTimeout(tick, typingSpeed);
                } else {
                    timeoutRef.current = setTimeout(() => setIsDeleting(true), pauseDuration);
                }
            } else {
                if (displayText.length > 0) {
                    setDisplayText(currentText.slice(0, displayText.length - 1));
                    timeoutRef.current = setTimeout(tick, typingSpeed / 2);
                } else {
                    setIsDeleting(false);
                    setTextIndex((i) => (i + 1) % texts.length);
                }
            }
        };
        timeoutRef.current = setTimeout(tick, typingSpeed);
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }, [displayText, isDeleting, textIndex, texts, typingSpeed, pauseDuration]);

    return displayText;
}

type MobileAuthLayoutProps = {
    forgotEmail: string;
    forgotSent: boolean;
    formData: SignupFormData;
    handleForgotPassword: (e: React.FormEvent) => Promise<void>;
    handleLogin: (e: React.FormEvent) => Promise<void>;
    handleSignupSubmit: () => Promise<void>;
    loading: boolean;
    loginEmail: string;
    loginPassword: string;
    message: AuthMessage;
    nextStep: () => void;
    panelSubtitle: string;
    prevStep: () => void;
    rememberMe: boolean;
    resendCooldown: number;
    resendSignupEmail: () => Promise<void>;
    setForgotEmail: (v: string) => void;
    setForgotSent: (v: boolean) => void;
    setFormData: Dispatch<SetStateAction<SignupFormData>>;
    setLoginEmail: (v: string) => void;
    setLoginPassword: (v: string) => void;
    setRememberMe: (v: boolean) => void;
    setShowLoginPassword: Dispatch<SetStateAction<boolean>>;
    setShowSignupPassword: Dispatch<SetStateAction<boolean>>;
    showLoginPassword: boolean;
    showSignupPassword: boolean;
    signupStep: number;
    switchView: (v: AuthView) => void;
    taglineIndex: number;
    view: AuthView;
};

export function MobileAuthLayout({
    forgotEmail, forgotSent, formData, handleForgotPassword, handleLogin,
    handleSignupSubmit, loading, loginEmail, loginPassword, message, nextStep,
    panelSubtitle, prevStep, rememberMe, resendCooldown, resendSignupEmail,
    setForgotEmail, setForgotSent, setFormData, setLoginEmail, setLoginPassword,
    setRememberMe, setShowLoginPassword, setShowSignupPassword, showLoginPassword,
    showSignupPassword, signupStep, switchView, view,
}: MobileAuthLayoutProps) {
    const [mode, setMode] = useState<'landing' | 'form'>('landing');
    const typedText = useTypingAnimation(TAGLINES);

    const handleLandingAction = (action: 'login' | 'signup') => {
        switchView(action);
        setMode('form');
    };

    useEffect(() => {
        if (view === 'forgot') setMode('form');
    }, [view]);

    return (
        <div
            className="lg:hidden relative flex min-h-screen flex-col"
            style={{ background: 'linear-gradient(160deg, var(--surface-secondary) 0%, var(--background) 45%, var(--surface-tertiary) 100%)' }}
        >
            {/* Minimal animated background lines */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <svg
                    viewBox="0 0 390 844"
                    xmlns="http://www.w3.org/2000/svg"
                    className="absolute inset-0 w-full h-full"
                    preserveAspectRatio="xMidYMid slice"
                >
                    <defs>
                        <filter id="line-glow">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <style>{`
                            .bg-line {
                                fill: none;
                                stroke: var(--border);
                                stroke-width: 1;
                                opacity: 0.5;
                            }
                            .bg-glow {
                                fill: none;
                                stroke: var(--primary);
                                stroke-width: 1.5;
                                filter: url(#line-glow);
                                opacity: 0;
                                stroke-dasharray: 60 2000;
                                stroke-dashoffset: 0;
                            }
                            .bg-glow-1 { animation: line-travel 10s ease-in-out infinite; animation-delay: 0s; }
                            .bg-glow-2 { animation: line-travel 10s ease-in-out infinite; animation-delay: -3.3s; }
                            .bg-glow-3 { animation: line-travel 10s ease-in-out infinite; animation-delay: -6.6s; }
                            @keyframes line-travel {
                                0%   { stroke-dashoffset: 0;     opacity: 0; }
                                8%   { opacity: 0.28; }
                                88%  { opacity: 0.2; }
                                100% { stroke-dashoffset: -2200; opacity: 0; }
                            }
                        `}</style>
                    </defs>

                    {/* 3 subtle diagonal lines, clustered left-center */}
                    <line className="bg-line" x1="20" y1="-20" x2="250" y2="864" />
                    <line className="bg-line" x1="-30" y1="300" x2="420" y2="580" />
                    <line className="bg-line" x1="100" y1="-20" x2="320" y2="864" />

                    {/* Travelling glow */}
                    <line className="bg-glow bg-glow-1" x1="20" y1="-20" x2="250" y2="864" />
                    <line className="bg-glow bg-glow-2" x1="-30" y1="300" x2="420" y2="580" />
                    <line className="bg-glow bg-glow-3" x1="100" y1="-20" x2="320" y2="864" />
                </svg>
            </div>

            {/* Logo — left aligned */}
            <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-2.5 px-7 pt-14 z-10"
            >
                <img src="/icon.svg" alt="PansGPT" className="h-6 w-6 object-contain" />
                <span
                    className="text-foreground text-lg font-bold"
                    style={{ fontFamily: 'var(--font-albert-sans, Albert Sans, sans-serif)' }}
                >
                    PansGPT
                </span>
            </motion.div>

            {/* Typing tagline — full desktop sentences, smaller font */}
            <div className="flex-1 flex flex-col justify-center px-7 z-10">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                >
                    {/* Static label like desktop */}
                    <div className="mb-5 inline-flex items-center rounded-full border border-border bg-surface-secondary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Built for Pharmacy School
                    </div>
                    <p
                        className="min-h-[80px] text-lg font-medium leading-relaxed text-foreground"
                        style={{ fontFamily: 'var(--font-albert-sans, Albert Sans, sans-serif)' }}
                    >
                        {typedText}
                        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded-sm bg-primary align-middle" />
                    </p>
                </motion.div>
            </div>

            {/* Bottom */}
            <AnimatePresence mode="wait">
                {mode === 'landing' ? (
                    <motion.div
                        key="landing"
                        initial={{ y: 60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 60, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="z-20 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
                    >
                        <div className="space-y-2.5 rounded-[2rem] border border-border bg-surface-primary/85 p-4 backdrop-blur-sm shadow-sm">
                            <button
                                onClick={() => handleLandingAction('signup')}
                                className="w-full rounded-[1.25rem] border border-border bg-secondary py-4 text-sm font-semibold text-secondary-foreground transition-all hover:bg-surface-tertiary"
                            >
                                Sign up
                            </button>
                            <button
                                onClick={() => handleLandingAction('login')}
                                className="w-full rounded-[1.25rem] bg-primary py-4 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/25 transition-all hover:bg-primary/90"
                            >
                                Log in
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="form"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                        className="fixed inset-x-0 bottom-0 z-30 max-h-[92vh] overflow-y-auto rounded-t-[2rem] border border-border bg-surface-primary px-6 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-sm"
                    >
                        {/* Drag handle */}
                        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />

                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-xl font-bold text-foreground">
                                {view === 'login' ? 'Welcome back' : view === 'signup' ? 'Create account' : 'Reset password'}
                            </h2>
                            <button
                                onClick={() => setMode('landing')}
                                className="px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                                Cancel
                            </button>
                        </div>
                        <p className="mb-5 text-sm text-muted-foreground">{panelSubtitle}</p>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={view}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.18 }}
                            >
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
                            </motion.div>
                        </AnimatePresence>

                        {view !== 'forgot' && (
                            <div className="mt-5 mb-2">
                                <p className="text-center text-sm font-medium text-muted-foreground">
                                    {view === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
                                    <button
                                        onClick={() => switchView(view === 'signup' ? 'login' : 'signup')}
                                        className="font-bold text-primary transition-colors hover:text-primary/90"
                                    >
                                        {view === 'signup' ? 'Sign in' : 'Sign up for free'}
                                    </button>
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
