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
            style={{ background: 'linear-gradient(160deg, #1a2e1a 0%, #152012 40%, #0d1a0d 100%)' }}
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
                                stroke: #2a4a2a;
                                stroke-width: 1;
                                opacity: 0.5;
                            }
                            .bg-glow {
                                fill: none;
                                stroke: #00c030;
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
                <img src="/icon.svg" alt="PansGPT" className="h-6 w-6 object-contain brightness-0 invert" />
                <span
                    className="text-white text-lg font-bold"
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
                    <div className="inline-flex items-center rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mb-5">
                        Built for Pharmacy School
                    </div>
                    <p
                        className="text-lg font-medium text-white/85 leading-relaxed min-h-[80px]"
                        style={{ fontFamily: 'var(--font-albert-sans, Albert Sans, sans-serif)' }}
                    >
                        {typedText}
                        <span className="inline-block w-[2px] h-4 bg-[#00a200] ml-0.5 animate-pulse align-middle rounded-sm" />
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
                        <div className="bg-white/5 backdrop-blur-sm rounded-[2rem] p-4 space-y-2.5 border border-white/8 shadow-2xl">
                            <button
                                onClick={() => handleLandingAction('signup')}
                                className="w-full py-4 rounded-[1.25rem] bg-white/8 text-white font-semibold text-sm hover:bg-white/12 transition-all"
                            >
                                Sign up
                            </button>
                            <button
                                onClick={() => handleLandingAction('login')}
                                className="w-full py-4 rounded-[1.25rem] bg-[#00a200] text-white font-bold text-sm shadow-lg shadow-[#00a200]/25 hover:bg-[#008c00] transition-all"
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
                        className="fixed inset-x-0 bottom-0 z-30 rounded-t-[2rem] bg-white px-6 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl max-h-[92vh] overflow-y-auto"
                    >
                        {/* Drag handle */}
                        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-xl font-bold text-slate-900">
                                {view === 'login' ? 'Welcome back' : view === 'signup' ? 'Create account' : 'Reset password'}
                            </h2>
                            <button
                                onClick={() => setMode('landing')}
                                className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors px-2 py-1"
                            >
                                Cancel
                            </button>
                        </div>
                        <p className="text-sm text-slate-500 mb-5">{panelSubtitle}</p>

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
                                <p className="text-center text-sm text-slate-500 font-medium">
                                    {view === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
                                    <button
                                        onClick={() => switchView(view === 'signup' ? 'login' : 'signup')}
                                        className="font-bold text-[#00a200] hover:text-[#008c00] transition-colors"
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