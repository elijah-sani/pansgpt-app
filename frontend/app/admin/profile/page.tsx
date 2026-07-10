'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ShieldCheck,
    FileText,
    Lock,
    Mail,
    Calendar,
    LogOut,
    Eye,
    EyeOff,
    CheckCircle2,
    XCircle,
    Loader2,
    ChevronRight,
    GraduationCap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchBootstrap } from '@/lib/bootstrap-cache';
import { clearAdminWorkspaceUniversity } from '@/lib/admin-workspace';

export default function AdminProfilePage() {
    const router = useRouter();
    const [profile, setProfile] = useState<any>(null);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [adminLevel, setAdminLevel] = useState<'senior' | 'standard' | null>(null);
    const [universityName, setUniversityName] = useState<string | null>(null);
    const [fileCount, setFileCount] = useState<number>(0);
    const [userEmail, setUserEmail] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    // Expanded row state
    const [securityOpen, setSecurityOpen] = useState(false);
    const [activityOpen, setActivityOpen] = useState(false);

    // Password change state
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const loadProfile = async () => {
            setIsLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                setUserEmail(user?.email ?? '');

                const data = await fetchBootstrap();
                if (!data || !data.is_admin) {
                    router.push('/');
                    return;
                }
                setProfile(data.profile);
                setIsSuperAdmin(Boolean(data.is_super_admin));
                setAdminLevel(data.admin_level || null);
                setUniversityName(data.university_name || data.profile?.university || 'University Workspace');
                setFileCount(data.file_count || 0);
            } catch (err) {
                console.error('Error loading admin profile:', err);
            } finally {
                setIsLoading(false);
            }
        };
        void loadProfile();
    }, [router]);

    const handleSignOut = async () => {
        clearAdminWorkspaceUniversity();
        await supabase.auth.signOut();
        window.location.replace('/login');
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordMessage(null);
        if (!newPassword || !confirmPassword) {
            setPasswordMessage({ type: 'error', text: 'All fields are required.' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordMessage({ type: 'error', text: 'Passwords do not match.' });
            return;
        }
        if (newPassword.length < 6) {
            setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
            return;
        }
        setIsSavingPassword(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setPasswordMessage({ type: 'success', text: 'Password updated successfully.' });
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setPasswordMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Failed to update password.',
            });
        } finally {
            setIsSavingPassword(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!profile) return null;

    const fullName =
        profile.full_name ||
        `${profile.first_name || ''} ${profile.other_names || ''}`.trim() ||
        'Administrator';

    const currentAvatar =
        profile.avatar_url ||
        `https://api.dicebear.com/9.x/toon-head/svg?translateY=5&beardProbability=30&eyebrows=happy,neutral,raised,sad,angry&hairColor=2c1b18,724133,a55728,b58143&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4&seed=${userEmail || 'default'}`;

    const displayRole =
        adminLevel === 'senior' ? 'Senior Admin' : isSuperAdmin ? 'Super Admin' : 'Standard Admin';

    const activeSinceDate = profile.created_at
        ? new Date(profile.created_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
          })
        : 'N/A';

    return (
        <div className="mx-auto w-full max-w-5xl py-4">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">

                {/* ── Left: Profile Card ── */}
                <div className="w-full lg:w-72 lg:shrink-0 lg:sticky lg:top-6">
                    <div className="relative overflow-hidden rounded-2xl bg-card">
                        {/* Ambient gradient */}
                        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

                        <div className="relative z-10 px-5 pt-6 pb-5 flex flex-col items-center text-center">
                            {/* Avatar */}
                            <div className="w-[72px] h-[72px] rounded-full bg-muted shadow-sm overflow-hidden ring-2 ring-primary/30">
                                <img src={currentAvatar} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                            </div>

                            {/* Name */}
                            <h3 className="text-lg font-bold text-foreground mt-3 leading-tight">{fullName}</h3>

                            {/* University line */}
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                <GraduationCap className="w-3.5 h-3.5" />
                                {universityName}
                            </p>

                            {/* Files uploaded pill */}
                            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                <FileText className="h-3 w-3" />
                                {fileCount} {fileCount === 1 ? 'file' : 'files'} uploaded
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Right: Sections ── */}
                <div className="flex-1 min-w-0 space-y-3">

                    {/* Account section */}
                    <div>
                        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Account</h3>
                        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">

                            {/* Email row */}
                            <div className="flex items-center gap-3 w-full py-3.5 px-4">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                    <Mail size={15} className="text-blue-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Email Address</p>
                                    <p className="text-sm font-medium text-foreground truncate">{userEmail || '—'}</p>
                                </div>
                            </div>

                            <div className="mx-4 h-px bg-border/50" />

                            {/* Role row */}
                            <div className="flex items-center gap-3 w-full py-3.5 px-4">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <ShieldCheck size={15} className="text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Administrator Role</p>
                                    <p className="text-sm font-medium text-foreground">{displayRole} · {universityName}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Security section */}
                    <div>
                        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Security</h3>
                        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                            <button
                                type="button"
                                onClick={() => setSecurityOpen((prev) => !prev)}
                                className="flex items-center gap-3 w-full py-3.5 px-4 text-left transition-all hover:bg-muted/40 active:bg-muted/50 group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                                    <Lock size={15} className="text-orange-500" />
                                </div>
                                <span className="flex-1 text-sm font-medium text-foreground">Change Password</span>
                                <ChevronRight
                                    size={15}
                                    className={`text-muted-foreground/50 group-hover:text-muted-foreground transition-all duration-200 ${securityOpen ? 'rotate-90' : ''}`}
                                />
                            </button>

                            {securityOpen && (
                                <div className="px-4 pb-4 pt-1 border-t border-border/50">
                                    <form onSubmit={handlePasswordChange} className="space-y-3">
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">New Password</label>
                                                <div className="relative mt-1">
                                                    <input
                                                        type={showPassword ? 'text' : 'password'}
                                                        value={newPassword}
                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                        placeholder="Min. 6 characters"
                                                        className="w-full rounded-xl border border-border/80 bg-background/50 px-4 py-2.5 text-sm transition-all focus:border-primary focus:bg-background focus:outline-none"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                    >
                                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Confirm Password</label>
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    placeholder="Confirm password"
                                                    className="mt-1 w-full rounded-xl border border-border/80 bg-background/50 px-4 py-2.5 text-sm transition-all focus:border-primary focus:bg-background focus:outline-none"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        {passwordMessage && (
                                            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
                                                passwordMessage.type === 'success'
                                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                    : 'bg-destructive/10 text-destructive'
                                            }`}>
                                                {passwordMessage.type === 'success'
                                                    ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                                                    : <XCircle className="h-4 w-4 shrink-0" />}
                                                <span>{passwordMessage.text}</span>
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isSavingPassword}
                                            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                                        >
                                            {isSavingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                                            Save New Password
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Activity section */}
                    <div>
                        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Activity</h3>
                        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                            <button
                                type="button"
                                onClick={() => setActivityOpen((prev) => !prev)}
                                className="flex items-center gap-3 w-full py-3.5 px-4 text-left transition-all hover:bg-muted/40 active:bg-muted/50 group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                                    <Calendar size={15} className="text-violet-500" />
                                </div>
                                <span className="flex-1 text-sm font-medium text-foreground">Activity Information</span>
                                <ChevronRight
                                    size={15}
                                    className={`text-muted-foreground/50 group-hover:text-muted-foreground transition-all duration-200 ${activityOpen ? 'rotate-90' : ''}`}
                                />
                            </button>

                            {activityOpen && (
                                <div className="px-4 pb-4 pt-1 border-t border-border/50">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Admin Account Created</p>
                                    <p className="mt-0.5 text-sm font-medium text-foreground">{activeSinceDate}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sign Out */}
                    <div>
                        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                            <button
                                type="button"
                                onClick={handleSignOut}
                                className="flex items-center gap-3 w-full py-3.5 px-4 text-left transition-all hover:bg-red-500/5 active:bg-red-500/10 group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 group-hover:bg-red-500/15 transition-colors">
                                    <LogOut size={15} className="text-red-500" />
                                </div>
                                <span className="text-sm font-medium text-foreground group-hover:text-red-500 transition-colors">Sign Out</span>
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
