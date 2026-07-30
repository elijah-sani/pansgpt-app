'use client';

import React from 'react';
import Image from 'next/image'; // [IMG OPTIMIZATION]
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
import { clearAdminWorkspaceUniversity } from '@/lib/admin-workspace';

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
    hideBackButton?: boolean;
    onClose: () => void;
    onOpenTimetable?: () => void;
    onOpenPersonalInfo?: () => void;
    onOpenQuizPerformance?: () => void;
}

export default function ProfileSidebar({
    user,
    isAdmin,
    hideBackButton = false,
    onClose,
    onOpenTimetable,
    onOpenPersonalInfo,
    onOpenQuizPerformance,
}: ProfileSidebarProps) {
    const router = useRouter();

    const handleLogout = async () => {
        clearAdminWorkspaceUniversity();
        await supabase.auth.signOut();
        onClose();
        window.location.replace('/login');
    };

    const currentAvatar =
        user.avatarUrl ||
        `https://api.dicebear.com/9.x/toon-head/svg?translateY=5&beardProbability=30&eyebrows=happy,neutral,raised,sad,angry&hairColor=2c1b18,724133,a55728,b58143&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4&seed=${user.email || 'default'}`;

    return (
        <>
            <div className={`relative z-50 w-full flex flex-col bg-background overflow-hidden ${hideBackButton ? 'p-1' : 'h-full'}`}>
                <div className={`flex items-center border-b border-border/50 ${hideBackButton ? 'px-3 py-2' : 'px-5 py-4'}`}>
                    {!hideBackButton && (
                        <button
                            onClick={onClose}
                            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
                        >
                            <ChevronLeft size={20} />
                        </button>
                    )}
                    <div className={`flex-1 flex items-center justify-center ${!hideBackButton ? 'pr-7' : ''}`}>
                        <h2 className={`font-semibold text-foreground tracking-tight ${hideBackButton ? 'text-sm' : 'text-base'}`}>Profile</h2>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className={`rounded-xl overflow-hidden bg-card relative ${hideBackButton ? 'mx-2 mt-2' : 'mx-4 mt-4'}`}>
                        <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

                        <div className={`flex flex-col items-center text-center relative z-10 ${hideBackButton ? 'px-3 pt-3 pb-3' : 'px-5 pt-6 pb-5'}`}>
                            <div className={`rounded-full bg-muted shadow-xs overflow-hidden ring-2 ring-primary/30 relative ${hideBackButton ? 'w-12 h-12' : 'w-[72px] h-[72px]'}`}>
                                <Image src={currentAvatar} alt="Avatar" fill sizes="72px" unoptimized={typeof currentAvatar === "string" && currentAvatar.includes("dicebear.com")} className="w-full h-full object-cover rounded-full" />
                            </div>

                            <h3 className={`font-bold text-foreground mt-2 leading-tight ${hideBackButton ? 'text-sm' : 'text-lg'}`}>{user.name || 'User'}</h3>
                            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                <GraduationCap className="w-3 h-3" />
                                {user.university || 'University of Jos'} - {user.level || '400'} Level
                            </p>
                        </div>
                    </div>

                    {!hideBackButton && (
                        <div className="mt-1">
                            <TodaysClasses onSeeAll={onOpenTimetable} level={user.level} />
                        </div>
                    )}

                    <div className={`${hideBackButton ? 'mt-2 px-2 pb-2' : 'mt-4 px-4 pb-4'}`}>
                        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1.5">Account</h3>

                        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                            <div>
                                <button
                                    onClick={onOpenPersonalInfo}
                                    className={`flex items-center gap-2.5 w-full text-left transition-all hover:bg-muted/40 active:bg-muted/50 group ${hideBackButton ? 'py-2.5 px-3' : 'py-3.5 px-4'}`}
                                >
                                    <div className={`rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 ${hideBackButton ? 'w-7 h-7' : 'w-8 h-8'}`}>
                                        <User size={hideBackButton ? 14 : 16} className="text-blue-500" />
                                    </div>
                                    <span className={`flex-1 font-medium text-foreground ${hideBackButton ? 'text-xs' : 'text-sm'}`}>Personal Information</span>
                                    <ChevronRight size={14} className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                                </button>

                                <button
                                    onClick={onOpenQuizPerformance}
                                    className={`flex items-center gap-2.5 w-full text-left transition-all hover:bg-muted/40 active:bg-muted/50 group ${hideBackButton ? 'py-2.5 px-3' : 'py-3.5 px-4'}`}
                                >
                                    <div className={`rounded-lg bg-primary/10 flex items-center justify-center shrink-0 ${hideBackButton ? 'w-7 h-7' : 'w-8 h-8'}`}>
                                        <BarChart3 size={hideBackButton ? 14 : 16} className="text-primary" />
                                    </div>
                                    <span className={`flex-1 font-medium text-foreground ${hideBackButton ? 'text-xs' : 'text-sm'}`}>Quiz Performance</span>
                                    <ChevronRight size={14} className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                                </button>

                                {isAdmin && (
                                    <button
                                        onClick={() => { router.push('/admin'); onClose(); }}
                                        className={`flex items-center gap-2.5 w-full text-left transition-all hover:bg-muted/40 active:bg-muted/50 group ${hideBackButton ? 'py-2.5 px-3' : 'py-3.5 px-4'}`}
                                    >
                                        <div className={`rounded-lg bg-primary/10 flex items-center justify-center shrink-0 ${hideBackButton ? 'w-7 h-7' : 'w-8 h-8'}`}>
                                            <LayoutDashboard size={hideBackButton ? 14 : 16} className="text-primary" />
                                        </div>
                                        <span className={`flex-1 font-medium text-foreground ${hideBackButton ? 'text-xs' : 'text-sm'}`}>Admin Dashboard</span>
                                        <ChevronRight size={14} className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
