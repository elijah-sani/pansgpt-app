'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, Building2, Cpu, HeartPulse, ShieldCheck, UserCog } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { api } from '@/lib/api';
import { fetchBootstrap } from '@/lib/bootstrap-cache';

type University = {
    id: string;
    name: string;
    status?: string | null;
};

type AdminUser = {
    id?: string;
    email: string;
    role: string;
    university_id?: string | null;
};

export default function SuperAdminOverviewPage() {
    const [universities, setUniversities] = useState<University[]>([]);
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [configLoaded, setConfigLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [adminName, setAdminName] = useState('Admin');

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const bootstrap = await fetchBootstrap();
                if (bootstrap?.profile?.first_name) {
                    setAdminName(bootstrap.profile.first_name);
                } else if (bootstrap?.profile?.full_name) {
                    setAdminName(bootstrap.profile.full_name.split(' ')[0]);
                }

                const [universitiesRes, usersRes, configRes] = await Promise.all([
                    api.get('/admin/universities'),
                    api.get('/admin/users'),
                    api.get('/admin/config'),
                ]);
                if (universitiesRes.ok) {
                    const payload = await universitiesRes.json();
                    setUniversities(payload.data || []);
                }
                if (usersRes.ok) {
                    const payload = await usersRes.json();
                    setAdmins(payload.data || []);
                }
                setConfigLoaded(configRes.ok);
            } finally {
                setIsLoading(false);
            }
        };
        void load();
    }, []);

    const activeUniversities = universities.filter((item) => (item.status || 'active').toLowerCase() === 'active').length;
    const universityAdmins = admins.filter((item) => item.role === 'university_admin' || (item.role === 'admin' && item.university_id)).length;

    const cards = useMemo(() => [
        { label: 'Universities', value: universities.length, sub: `${activeUniversities} active`, icon: Building2, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        { label: 'University Admins', value: universityAdmins, sub: 'Assigned school operators', icon: UserCog, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        { label: 'AI Config', value: configLoaded ? 'Ready' : 'Check', sub: 'Global controls', icon: Cpu, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        { label: 'Platform Status', value: 'Online', sub: 'Backend reachable', icon: HeartPulse, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    ], [activeUniversities, configLoaded, universities.length, universityAdmins]);
    const timeGreeting = getTimeGreeting();

    return (
        <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-5 md:px-0">
            <div className="space-y-6 md:space-y-8">
                <div className="space-y-5 md:hidden">
                    <section className="space-y-1">
                        <h2 className="text-3xl font-semibold tracking-tight text-foreground">Hi, {adminName}!</h2>
                        <p className="text-sm text-muted-foreground">{timeGreeting}</p>
                    </section>

                    <section className="mt-6 space-y-3">
                        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Quick Actions</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <MobileActionCard href="/super-admin/universities" icon={Building2} label="Universities" value="Manage schools" color="text-amber-500" bg="bg-amber-500/10" />
                            <MobileActionCard href="/super-admin/university-admins" icon={UserCog} label="Admins" value="Assign access" color="text-amber-500" bg="bg-amber-500/10" />
                            <MobileActionCard href="/super-admin/ai-configuration" icon={Cpu} label="AI Config" value="Global controls" color="text-amber-500" bg="bg-amber-500/10" />
                            <MobileActionCard href="/super-admin/system-health" icon={HeartPulse} label="Health" value="Check status" color="text-amber-500" bg="bg-amber-500/10" />
                        </div>
                    </section>

                    <section className="mt-6 space-y-3">
                        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Platform Vitals</h2>
                        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                            {cards.map((card, index) => (
                                <QuickVitalRow
                                    key={card.label}
                                    {...card}
                                    loading={isLoading}
                                    isLast={index === cards.length - 1}
                                />
                            ))}
                        </div>
                    </section>
                </div>

                <section className="hidden space-y-8 md:block">
                    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Platform Portal</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Super Admin Overview</h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                        Manage platform-level setup, universities, global AI controls, and support surfaces.
                    </p>
                </div>
                <Link href="/super-admin/universities" className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-500">
                    <Building2 className="h-4 w-4" />
                    Enter University Workspace
                </Link>
                    </header>

                    <section className="space-y-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Quick Actions</p>
                            <h2 className="mt-1 text-xl font-semibold tracking-tight">Platform controls</h2>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <Shortcut href="/super-admin/universities" icon={Building2} title="Manage Universities" description="Create, edit, activate, suspend, and enter a school workspace." />
                        <Shortcut href="/super-admin/university-admins" icon={UserCog} title="Manage University Admins" description="Assign existing users as university workspace operators." />
                        <Shortcut href="/super-admin/ai-configuration" icon={Cpu} title="AI Configuration" description="Update global system prompt, model behavior, and retrieval settings." />
                        <Shortcut href="/super-admin/system-health" icon={Activity} title="System Health" description="Check basic platform and configuration status." />
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Platform Vitals</p>
                            <h2 className="mt-1 text-xl font-semibold tracking-tight">Current status</h2>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {cards.map((card) => (
                                <OverviewCard key={card.label} {...card} loading={isLoading} />
                            ))}
                        </div>
                    </section>
                </section>
            </div>
        </div>
    );
}

function OverviewCard({ label, value, sub, icon: Icon, color, bg, loading }: { label: string; value: string | number; sub: string; icon: LucideIcon; color: string; bg: string; loading: boolean }) {
    return (
        <div className="rounded-2xl border border-border bg-transparent p-5 transition-colors hover:border-amber-500/40">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-3 text-2xl font-semibold text-foreground">{loading ? '...' : value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
                </div>
                <div className={`rounded-xl border border-amber-500/20 p-2 ${bg} ${color}`}>
                    <Icon className="h-5 w-5" />
                </div>
            </div>
        </div>
    );
}

function QuickVitalRow({ label, value, sub, icon: Icon, color, bg, loading, isLast }: { label: string; value: string | number; sub: string; icon: LucideIcon; color: string; bg: string; loading: boolean; isLast: boolean }) {
    return (
        <div className={`flex items-center justify-between gap-3 p-4 ${isLast ? '' : 'border-b border-border'}`}>
            <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg} ${color}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{label}</p>
                    <p className="truncate text-xs text-muted-foreground">{sub}</p>
                </div>
            </div>
            <p className="shrink-0 text-sm font-bold text-amber-500">{loading ? '...' : value}</p>
        </div>
    );
}

function MobileActionCard({ href, icon: Icon, label, value, color, bg }: { href: string; icon: LucideIcon; label: string; value: string; color: string; bg: string }) {
    return (
        <Link href={href} className="rounded-2xl border border-border bg-transparent p-4 active:scale-[0.98]">
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${bg} ${color}`}>
                <Icon className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{value}</p>
        </Link>
    );
}

function getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning. Your platform workspace is ready.';
    if (hour < 17) return 'Good afternoon. Your platform workspace is ready.';
    return 'Good evening. Your platform workspace is ready.';
}

function Shortcut({ href, icon: Icon, title, description }: { href: string; icon: LucideIcon; title: string; description: string }) {
    return (
        <Link href={href} className="group rounded-2xl border border-border bg-transparent p-5 transition-colors hover:border-amber-500/40">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-500">
                <Icon className="h-5 w-5" />
            </div>
            <h2 className="font-semibold transition-colors group-hover:text-amber-500">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-amber-500">
                <ShieldCheck className="h-3.5 w-3.5" />
                Open
            </div>
        </Link>
    );
}
