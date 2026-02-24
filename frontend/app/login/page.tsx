'use client';

import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import AbstractCube from '@/components/AbstractCube';

const NIGERIAN_UNIVERSITIES = [
    "University of Lagos (UNILAG)",
    "Obafemi Awolowo University (OAU)",
    "University of Ibadan (UI)",
    "University of Benin (UNIBEN)",
    "Ahmadu Bello University (ABU)",
    "University of Nigeria, Nsukka (UNN)",
    "Lagos State University (LASU)",
    "Covenant University",
    "Usman Danfodiyo University (UDUS)",
    "Nnamdi Azikiwe University (UNIZIK)",
    "University of Jos (UNIJOS)",
    "University of Ilorin (UNILORIN)",
    "Other"
];

const LEVELS = ["100lvl", "200lvl", "300lvl", "400lvl", "500lvl", "600lvl (PharmD)"];

export default function AuthPage() {
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const router = useRouter();

    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

    // Signup Wizard State
    const [signupStep, setSignupStep] = useState(0); // 0: Name, 1: Uni, 2: Level, 3: Auth
    const [formData, setFormData] = useState({
        firstName: '',
        otherNames: '',
        university: '',
        level: '',
        email: '',
        password: ''
    });

    // Login State
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password: loginPassword,
            });
            if (error) throw error;
            router.push('/main');
            router.refresh();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Login failed.';
            setMessage({ type: 'error', text: errorMessage });
        } finally {
            setLoading(false);
        }
    };

    const handleSignupSubmit = async () => {
        setLoading(true);
        setMessage(null);
        try {
            // 1. Create Auth User
            const { data, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                    // We still save full name here as backup/metadata
                    data: { full_name: `${formData.firstName} ${formData.otherNames}`.trim() }
                },
            });

            if (authError) throw authError;

            if (data.user) {
                // 2. Update Profile immediately
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({
                        first_name: formData.firstName,
                        other_names: formData.otherNames,
                        university: formData.university,
                        level: formData.level,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', data.user.id);

                if (profileError) {
                    // Non-blocking error log, user is created anyway
                    console.error("Profile update failed during signup", profileError);
                }

                // 3. Send welcome email (non-blocking, fire-and-forget)
                fetch('/api/welcome-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formData.firstName,
                        email: formData.email,
                    }),
                }).catch(() => { /* silently ignore email errors */ });
            }

            setMessage({ type: 'success', text: 'Account created! Check your email to confirm.' });

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Sign up failed.';
            setMessage({ type: 'error', text: errorMessage });
        } finally {
            setLoading(false);
        }
    };

    const nextStep = () => {
        setSignupStep(prev => prev + 1);
        setMessage(null);
    }

    const prevStep = () => {
        setSignupStep(prev => prev - 1);
        setMessage(null);
    }

    return (
        <div className="flex min-h-screen w-full bg-[#050505] font-sans text-slate-900 relative">
            {/* LEFT PANEL - BRANDING & ART */}
            <div className="absolute inset-0 flex flex-col justify-between p-12 overflow-hidden">
                {/* Background Glow */}
                <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] bg-green-900/20 rounded-full blur-[128px] pointer-events-none" />

                {/* Logo */}
                <div className="flex items-center gap-2 z-10 w-fit">
                    <img
                        src="/logo.png"
                        alt="PansGPT Logo"
                        className="h-9 w-auto object-contain"
                    />
                </div>

                {/* Abstract Art Container */}
                <div className="absolute top-1/2 left-[35%] -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-80 pointer-events-none">
                    <AbstractCube />
                </div>

                {/* Footer Text */}
                <div className="z-10 relative w-fit mb-12">
                    <p className="text-lg text-white font-medium max-w-md leading-relaxed">
                        Join a community of future pharmacists leveraging advanced AI to simplify complex concepts and ace their exams.
                    </p>
                    <div className="flex gap-2 mt-6">
                        <div className="h-1 w-8 bg-white rounded-full opacity-100" />
                        <div className="h-1 w-8 bg-white rounded-full opacity-30" />
                        <div className="h-1 w-8 bg-white rounded-full opacity-30" />
                        <div className="h-1 w-8 bg-white rounded-full opacity-30" />
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL - AUTH FORM */}
            <div className="relative ml-auto w-full lg:w-[34%] min-h-screen bg-white flex flex-col items-center justify-center p-8 lg:rounded-l-[3rem] overflow-hidden z-20">
                <div className="w-full max-w-sm">

                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-extrabold text-[#0F172A] tracking-tight mb-2">
                            {isSignUp ?
                                (signupStep === 0 ? "Let's get started" :
                                    signupStep === 1 ? "Your School" :
                                        signupStep === 2 ? "Your Level" : "Secure Account")
                                : 'Welcome Back'}
                        </h1>
                        <p className="text-slate-500 text-[15px]">
                            {isSignUp ?
                                (signupStep === 0 ? "First, what should we call you?" :
                                    signupStep === 1 ? "Tell us know where you're studying." :
                                        signupStep === 2 ? "Help us tailor your study materials." : "Almost done! Set your login details.")
                                : 'Please enter your details to access your dashboard.'}
                        </p>
                    </div>

                    {/* SIGN IN FORM */}
                    {!isSignUp && (
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-bold text-slate-700">Email address</label>
                                <input
                                    type="email"
                                    required
                                    value={loginEmail}
                                    onChange={(e) => setLoginEmail(e.target.value)}
                                    className="block w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                    placeholder="you@example.com"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-bold text-slate-700">Password</label>
                                    <button type="button" className="text-sm font-semibold text-green-600 hover:text-green-700 transition-colors">
                                        Forgot password?
                                    </button>
                                </div>
                                <input
                                    type="password"
                                    required
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                    className="block w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                    placeholder="••••••••"
                                />
                            </div>

                            <div className="flex items-center">
                                <input id="remember-me" type="checkbox" className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded accent-green-600" />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-500">Remember me</label>
                            </div>

                            {message && (
                                <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                                    {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
                                    <p>{message.text}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center py-3.5 px-4 rounded-xl text-white bg-[#00C853] hover:bg-[#00b54b] transition-all font-bold text-sm tracking-wide shadow-md shadow-green-500/20"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in'}
                            </button>
                        </form>
                    )}

                    {/* SIGN UP WIZARD */}
                    {isSignUp && (
                        <div className="space-y-6">

                            {/* Step 0: Name */}
                            {signupStep === 0 && (
                                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-bold text-slate-700">First Name</label>
                                        <input
                                            type="text"
                                            autoFocus
                                            value={formData.firstName}
                                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                            onKeyDown={(e) => e.key === 'Enter' && formData.firstName && nextStep()}
                                            className="block w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                            placeholder="e.g. Victor"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-bold text-slate-700">Other Names</label>
                                        <input
                                            type="text"
                                            value={formData.otherNames}
                                            onChange={(e) => setFormData({ ...formData, otherNames: e.target.value })}
                                            onKeyDown={(e) => e.key === 'Enter' && formData.firstName && nextStep()}
                                            className="block w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                            placeholder="e.g. Oluwaseun"
                                        />
                                    </div>
                                    <button
                                        onClick={nextStep}
                                        disabled={!formData.firstName}
                                        className="w-full py-3.5 rounded-xl text-white bg-[#00C853] hover:bg-[#00b54b] font-bold text-sm shadow-md shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        Continue
                                    </button>
                                </div>
                            )}

                            {/* Step 1: University */}
                            {signupStep === 1 && (
                                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-bold text-slate-700">University</label>
                                        <select
                                            autoFocus
                                            value={formData.university}
                                            onChange={(e) => setFormData({ ...formData, university: e.target.value })}
                                            className="block w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium appearance-none"
                                        >
                                            <option value="">Select University</option>
                                            {NIGERIAN_UNIVERSITIES.map(uni => (
                                                <option key={uni} value={uni}>{uni}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={prevStep} className="px-4 py-3.5 rounded-xl border border-gray-200 text-slate-600 hover:bg-gray-50 font-bold text-sm"><ArrowLeft className="w-4 h-4" /></button>
                                        <button
                                            onClick={nextStep}
                                            disabled={!formData.university}
                                            className="flex-1 py-3.5 rounded-xl text-white bg-[#00C853] hover:bg-[#00b54b] font-bold text-sm shadow-md shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            Continue
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Level */}
                            {signupStep === 2 && (
                                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-bold text-slate-700">Level</label>
                                        <select
                                            autoFocus
                                            value={formData.level}
                                            onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                                            className="block w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium appearance-none"
                                        >
                                            <option value="">Select Level</option>
                                            {LEVELS.map(lvl => (
                                                <option key={lvl} value={lvl}>{lvl}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={prevStep} className="px-4 py-3.5 rounded-xl border border-gray-200 text-slate-600 hover:bg-gray-50 font-bold text-sm"><ArrowLeft className="w-4 h-4" /></button>
                                        <button
                                            onClick={nextStep}
                                            disabled={!formData.level}
                                            className="flex-1 py-3.5 rounded-xl text-white bg-[#00C853] hover:bg-[#00b54b] font-bold text-sm shadow-md shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            Continue
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Step 3: Auth Creds */}
                            {signupStep === 3 && (
                                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-bold text-slate-700">Email</label>
                                            <input
                                                type="email"
                                                autoFocus
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="block w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                                placeholder="student@uni.edu.ng"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-bold text-slate-700">Password</label>
                                            <input
                                                type="password"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                className="block w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                    </div>

                                    {message && (
                                        <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                                            {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
                                            <p>{message.text}</p>
                                        </div>
                                    )}

                                    <div className="flex gap-3">
                                        <button onClick={prevStep} className="px-4 py-3.5 rounded-xl border border-gray-200 text-slate-600 hover:bg-gray-50 font-bold text-sm"><ArrowLeft className="w-4 h-4" /></button>
                                        <button
                                            onClick={handleSignupSubmit}
                                            disabled={loading || !formData.email || !formData.password}
                                            className="flex-1 flex items-center justify-center py-3.5 px-4 rounded-xl text-white bg-[#00C853] hover:bg-[#00b54b] transition-all font-bold text-sm tracking-wide shadow-md shadow-green-500/20 disabled:opacity-70"
                                        >
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}

                    {/* Footer / Toggle */}
                    <div className="mt-8">
                        {!isSignUp && (
                            <>
                                <div className="relative flex py-2 items-center">
                                    <div className="flex-grow border-t border-gray-200"></div>
                                    <span className="flex-shrink-0 mx-4 text-gray-400 text-xs font-bold uppercase tracking-wider">Or continue with</span>
                                    <div className="flex-grow border-t border-gray-200"></div>
                                </div>

                                <button className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-[#0F172A] font-bold hover:bg-gray-50 transition-all shadow-sm mb-6">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                    Google
                                </button>
                            </>
                        )}

                        <p className="text-center text-sm text-slate-500 font-medium">
                            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                            <button
                                onClick={() => {
                                    setIsSignUp(!isSignUp);
                                    setSignupStep(0);
                                    setMessage(null);
                                }}
                                className="font-bold text-green-600 hover:text-green-700 transition-colors"
                            >
                                {isSignUp ? 'Sign in' : 'Sign up for free'}
                            </button>
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}
