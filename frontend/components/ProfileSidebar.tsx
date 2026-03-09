'use client';

import React from 'react';
import {
    ChevronLeft,
    ChevronRight,
    User,
    BarChart3,
    LogOut,
    GraduationCap,
    LayoutDashboard,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import TodaysClasses from '@/components/TodaysClasses';
import { supabase } from '@/lib/supabase';

interface ProfileSidebarProps {
    user: {
        name?: string;
        email?: string;
        avatarUrl?: string;
        university?: string;
        level?: string;
        subscriptionTier?: string;
    };
    isAdmin?: boolean;
    onClose: () => void;
    onOpenTimetable?: () => void;
    onOpenPersonalInfo?: () => void;
    onOpenQuizPerformance?: () => void;
}

export default function ProfileSidebar({
    user,
    isAdmin,
    onClose,
    onOpenTimetable,
    onOpenPersonalInfo,
    onOpenQuizPerformance,
}: ProfileSidebarProps) {
    const router = useRouter();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        onClose();
        window.location.replace('/login');
    };

    const currentAvatar =
        user.avatarUrl ||
        `https://api.dicebear.com/9.x/toon-head/svg?translateY=5&beardProbability=30&eyebrows=happy,neutral,raised,sad,angry&hairColor=2c1b18,724133,a55728,b58143&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4&seed=${user.email || 'default'}`;

    return (
        <>
            <div className="relative z-50 w-full h-full flex flex-col bg-background border-l border-border overflow-hidden">
                <div className="flex items-center px-5 py-4 border-b border-border/50">
                    <button
                        onClick={onClose}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex-1 flex items-center justify-center pr-7">
                        <h2 className="text-base font-semibold text-foreground tracking-tight">Profile</h2>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="mx-4 mt-4 rounded-2xl overflow-hidden border border-border bg-card relative">
                        <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

                        <div className="px-5 pt-6 pb-5 flex flex-col items-center text-center relative z-10">
                            <div className="w-[72px] h-[72px] rounded-full bg-muted border-[3px] border-card shadow-lg overflow-hidden ring-2 ring-primary/30">
                                <img src={currentAvatar} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                            </div>

                            <h3 className="text-lg font-bold text-foreground mt-3 leading-tight">{user.name || 'User'}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                <GraduationCap className="w-3.5 h-3.5" />
                                {user.university || 'University of Jos'} - {user.level || '400'} Level
                            </p>
                        </div>
                    </div>

                    <div className="mt-1">
                        <TodaysClasses onSeeAll={onOpenTimetable} level={user.level} />
                    </div>

                    <div className="mt-4 px-4 pb-4">
                        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Account</h3>

                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                            <div className="divide-y divide-border/60">
                                <button
                                    onClick={onOpenPersonalInfo}
                                    className="flex items-center gap-3 w-full py-3.5 px-4 text-left transition-all hover:bg-muted/40 active:bg-muted/50 group"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                        <User size={16} className="text-blue-500" />
                                    </div>
                                    <span className="flex-1 text-sm font-medium text-foreground">Personal Information</span>
                                    <ChevronRight size={15} className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                                </button>

                                <button
                                    onClick={onOpenQuizPerformance}
                                    className="flex items-center gap-3 w-full py-3.5 px-4 text-left transition-all hover:bg-muted/40 active:bg-muted/50 group"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                        <BarChart3 size={16} className="text-emerald-500" />
                                    </div>
                                    <span className="flex-1 text-sm font-medium text-foreground">Quiz Performance</span>
                                    <ChevronRight size={15} className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                                </button>

                                {isAdmin && (
                                    <button
                                        onClick={() => { router.push('/admin'); onClose(); }}
                                        className="flex items-center gap-3 w-full py-3.5 px-4 text-left transition-all hover:bg-muted/40 active:bg-muted/50 group"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                            <LayoutDashboard size={16} className="text-primary" />
                                        </div>
                                        <span className="flex-1 text-sm font-medium text-foreground">Admin Dashboard</span>
                                        <ChevronRight size={15} className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-4 py-3 border-t border-border/50">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full py-2.5 px-3 text-left transition-all rounded-xl hover:bg-red-500/10 active:bg-red-500/15 group"
                    >
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 group-hover:bg-red-500/15 transition-colors">
                            <LogOut size={16} className="text-red-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground group-hover:text-red-500 transition-colors">Log Out</span>
                    </button>
                </div>
            </div>
        </>
    );
}
