'use client';

import React, { useState, useEffect } from 'react';
import {
    Users, FileText, Brain, Zap,
    Activity, Search,
    ShieldCheck, AlertTriangle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { fetchBootstrap } from '@/lib/bootstrap-cache';

// --- Types ---
interface ActivityItem {
    id: string;
    type: 'upload' | 'user_join';
    title: string; // "Physics 101 Uploaded" or "John Doe Joined"
    subtitle: string; // "By Admin" or "admin@example.com"
    timestamp: Date;
    avatar?: string;
}

interface DashboardUser {
    email: string;
    created_at?: string;
}

interface DashboardDoc {
    id: string;
    file_size?: number;
    created_at: string;
    title: string;
    uploaded_by_email?: string;
}

interface DashboardStats {
    userCount: number;
    docCount: number;
    storageUsed: string;
    storagePercentage: number;
    aiStatus: string;
    apiCalls: string;
}

interface StatCardProps {
    icon: LucideIcon;
    label: string;
    value: string | number;
    trend?: string;
    sub?: string;
    color: string;
    bg: string;
    iconType?: LucideIcon;
    progress?: number;
}

export default function MissionControlPage() {
    const [adminName, setAdminName] = useState('Admin');
    const [stats, setStats] = useState({
        userCount: 0,
        docCount: 0,
        storageUsed: '0',
        storagePercentage: 0,
        aiStatus: 'Optimal',
        apiCalls: '0'
    });

    const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);
            try {
                const bootstrap = await fetchBootstrap();
                if (bootstrap?.profile?.first_name) {
                    setAdminName(bootstrap.profile.first_name);
                } else if (bootstrap?.profile?.full_name) {
                    setAdminName(bootstrap.profile.full_name.split(' ')[0]);
                }

                const response = await api.get('/admin/dashboard');
                if (!response.ok) throw new Error('Failed to fetch dashboard');
                const payload = await response.json();
                const dashboardStats = payload.stats;
                const recentUsers: DashboardUser[] = payload.recentUsers || [];
                const recentDocs: DashboardDoc[] = payload.recentDocs || [];

                setStats(dashboardStats);

                const activities: ActivityItem[] = [];

                recentUsers?.forEach(u => {
                    activities.push({
                        id: u.email,
                        type: 'user_join',
                        title: 'New Crew Member',
                        subtitle: u.email,
                        timestamp: new Date(u.created_at || Date.now()), // Fallback just in case
                        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}`
                    });
                });

                recentDocs.forEach(d => {
                    activities.push({
                        id: d.id,
                        type: 'upload',
                        title: 'Material Uploaded',
                        subtitle: d.title,
                        timestamp: new Date(d.created_at),
                    });
                });

                // Sort combined list by date desc
                activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                setRecentActivity(activities.slice(0, 8)); // Top 8 combined

            } catch (err) {
                console.error("Dashboard Fetch Error:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    const timeGreeting = getTimeGreeting();

    return (
        <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-5 md:px-0">
            <div className="space-y-6 md:space-y-7">
                {/* Mobile View */}
                <div className="space-y-5 md:hidden">
                    <section className="space-y-1">
                        <h2 className="text-3xl font-semibold tracking-tight text-foreground">Hi, {adminName}!</h2>
                        <p className="text-sm text-muted-foreground">{timeGreeting}</p>
                    </section>

                    <section className="space-y-3 mt-6">
                        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">The Vitals</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <QuickToolCard 
                                icon={Users} 
                                label="Active Users" 
                                value={stats.userCount} 
                                color="text-blue-500" 
                                bg="bg-blue-500/10" 
                            />
                            {(() => {
                                let sColor = "text-purple-500";
                                let sBg = "bg-purple-500/10";
                                if (stats.storagePercentage > 90) {
                                    sColor = "text-red-500";
                                    sBg = "bg-red-500/10";
                                } else if (stats.storagePercentage > 75) {
                                    sColor = "text-amber-500";
                                    sBg = "bg-amber-500/10";
                                }
                                return (
                                    <QuickToolCard 
                                        icon={FileText} 
                                        label="KB Storage" 
                                        value={stats.docCount} 
                                        color={sColor} 
                                        bg={sBg} 
                                    />
                                );
                            })()}
                            <QuickToolCard 
                                icon={stats.aiStatus === 'Optimal' ? ShieldCheck : AlertTriangle} 
                                label="AI Health" 
                                value={stats.aiStatus} 
                                color={stats.aiStatus === 'Optimal' ? "text-primary" : "text-amber-500"} 
                                bg={stats.aiStatus === 'Optimal' ? "bg-primary/10" : "bg-amber-500/10"} 
                            />
                            <QuickToolCard 
                                icon={Zap} 
                                label="API Usage" 
                                value={stats.apiCalls} 
                                color="text-yellow-500" 
                                bg="bg-yellow-500/10" 
                            />
                        </div>
                    </section>

                    <section className="space-y-3 mt-6">
                        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Live Feed</h2>
                        {isLoading ? (
                            <div className="text-center py-6 text-muted-foreground text-sm">Initializing sensors...</div>
                        ) : recentActivity.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground text-sm">All systems quiet.</div>
                        ) : (
                            <div className="relative mt-5">
                                {recentActivity.map((item) => (
                                    <MobileActivityCard 
                                        key={`${item.type}-${item.id}`} 
                                        item={item} 
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* Desktop View */}
                <section className="hidden space-y-6 md:block">
                    <div className="space-y-5 border-b border-border pb-6">
                        <div className="flex justify-between items-start">
                            <div className="space-y-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">System Overview & Live Operations</p>
                                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-[2.8rem] flex items-center gap-3">
                                    Welcome back, {adminName}
                                </h1>
                            </div>
                        </div>
                    </div>

                    {/* Row 1: The Vitals */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            icon={Users}
                            label="Active Users"
                            value={stats.userCount}
                            trend="+2 today"
                            color="text-blue-500"
                            bg="bg-blue-500/10"
                        />

                        {/* Dynamic Storage Card */}
                        {(() => {
                            let sColor = "text-purple-500";
                            let sBg = "bg-purple-500/10";
                            if (stats.storagePercentage > 90) {
                                sColor = "text-red-500";
                                sBg = "bg-red-500/10";
                            } else if (stats.storagePercentage > 75) {
                                sColor = "text-amber-500";
                                sBg = "bg-amber-500/10";
                            }
                            return (
                                <StatCard
                                    icon={FileText}
                                    label="Knowledge Base"
                                    value={stats.docCount}
                                    sub={`${stats.storageUsed} GB Used`}
                                    color={sColor}
                                    bg={sBg}
                                    progress={stats.storagePercentage}
                                />
                            );
                        })()}

                        <StatCard
                            icon={Brain}
                            label="AI Health"
                            value={stats.aiStatus}
                            color={stats.aiStatus === 'Optimal' ? "text-primary" : "text-amber-500"}
                            bg={stats.aiStatus === 'Optimal' ? "bg-primary/10" : "bg-amber-500/10"}
                            iconType={stats.aiStatus === 'Optimal' ? ShieldCheck : AlertTriangle}
                        />
                        <StatCard
                            icon={Zap}
                            label="API Usage"
                            value={stats.apiCalls}
                            trend="Stable"
                            color="text-yellow-500"
                            bg="bg-yellow-500/10"
                        />
                    </div>

                    {/* Row 2: Analytics & Activity */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* System Analytics (2/3) */}
                        <div className="lg:col-span-2 space-y-6">
                            <SystemAnalytics stats={stats} />
                        </div>

                        {/* Recent Activity (1/3) */}
                        <div className="bg-card border border-border rounded-2xl p-6 min-h-[400px]">
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                                <div className="flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-primary" />
                                    <h2 className="text-sm font-bold text-foreground tracking-[0.16em] uppercase">Live Feed</h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] text-muted-foreground font-mono">REALTIME</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {isLoading ? (
                                    <div className="text-center py-12 text-muted-foreground text-xs">Initializing sensors...</div>
                                ) : recentActivity.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground text-xs">All systems quiet.</div>
                                ) : (
                                    recentActivity.map((item, idx) => (
                                        <motion.div
                                            key={`${item.type}-${item.id}`}
                                            initial={{ opacity: 0, x: 10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="flex items-center gap-3 group"
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${item.type === 'upload'
                                                ? 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                                                : 'bg-primary/10 border-primary/30 text-primary'
                                                }`}>
                                                {item.type === 'upload' ? <FileText className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-foreground text-xs truncate group-hover:text-primary transition-colors">
                                                    {item.title}
                                                </p>
                                                <p className="text-muted-foreground text-[10px] truncate">
                                                    {item.subtitle}
                                                </p>
                                            </div>

                                            <span className="text-[10px] font-mono text-muted-foreground/50 whitespace-nowrap">
                                                {timeAgo(item.timestamp).replace(' ago', '')}
                                            </span>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

// --- Sub-Components ---

function StatCard({ icon: Icon, label, value, trend, sub, color, bg, iconType, progress }: StatCardProps) {
    const DisplayIcon = iconType || Icon;
    return (
        <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors shadow-sm relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-2.5 rounded-lg ${bg} ${color}`}>
                    <DisplayIcon className="w-5 h-5" />
                </div>
                {trend && <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">{trend}</span>}
            </div>
            <div>
                <h3 className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-1">{label}</h3>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">{value}</span>
                    {sub && <span className="text-xs text-muted-foreground font-medium">{sub}</span>}
                </div>
                {progress !== undefined && (
                    <div className="mt-3 h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${color.replace('text-', 'bg-')}`}
                            style={{ width: `${Math.min(100, progress)}%` }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

function SystemAnalytics({ stats }: { stats?: DashboardStats }) {
    // Mock Data for 7 Days (Visual only, as we don't track history yet)
    const dataPoints = [20, 45, 30, 60, 55, 80, 70];
    const max = Math.max(...dataPoints);
    const points = dataPoints.map((val, i) => `${i * 100},${100 - (val / max) * 80}`).join(' ');

    return (
        <div className="bg-card border border-border rounded-2xl p-6 h-full flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 relative z-10">
                <div>
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                        System Usage
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20">
                            LIVE
                        </span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">Real-time System Performance</p>
                </div>
                <div className="flex gap-4 text-xs font-mono">
                    <div className="flex flex-col items-end">
                        <span className="text-muted-foreground">Total Requests</span>
                        <span className="text-foreground font-bold">{stats?.apiCalls || '0'}</span>
                    </div>
                </div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 w-full bg-gradient-to-br from-muted/20 to-transparent rounded-xl border border-border/50 relative overflow-hidden group">
                {/* Grid Lines */}
                <div className="absolute inset-0 grid grid-rows-4 w-full h-full pointer-events-none">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="border-t border-border/30 w-full h-full" />
                    ))}
                </div>

                {/* SVG Chart */}
                <div className="absolute inset-0 p-4 pt-8">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 100">
                        <defs>
                            <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path
                            d={`M0,100 L0,${100 - (dataPoints[0] / max) * 80} ${points} L600,100 Z`}
                            fill="url(#gradient)"
                            className="transition-all duration-1000 ease-in-out"
                        />
                        <polyline
                            points={points}
                            fill="none"
                            stroke="var(--primary)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className=""
                        />
                        {/* Data Points */}
                        {dataPoints.map((val, i) => (
                            <circle
                                key={i}
                                cx={i * 100}
                                cy={100 - (val / max) * 80}
                                r="4"
                                className="fill-background stroke-primary stroke-2 hover:r-6 transition-all cursor-pointer"
                            >
                                <title>{val} Sessions</title>
                            </circle>
                        ))}
                    </svg>
                </div>
            </div>

            {/* Legend / Metrics */}
            <div className="mt-4 flex items-center gap-6 text-xs font-mono text-muted-foreground">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span>Peak: 84 Session/hr</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-muted border border-foreground/20" />
                    <span>Avg: 42 Session/hr</span>
                </div>
            </div>
        </div>
    );
}

function timeAgo(date: Date) {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "m ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "Just now";
}

function getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

function QuickToolCard({ icon: Icon, label, value, color, bg }: { icon: LucideIcon; label: string; value: string | number; color: string; bg: string }) {
    return (
        <div className="rounded-2xl border border-border bg-background/90 p-4 transition-colors hover:border-primary/30 hover:bg-muted/40">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${color.replace('text-', 'border-')}/15 ${bg} ${color}`}>
                <Icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
        </div>
    );
}

function MobileActivityCard({ item }: { item: ActivityItem }) {
    return (
        <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
            <div className="relative flex justify-center">
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-primary/20" />
                <span className="relative mt-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/10" />
            </div>

            <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.subtitle}</p>
                </div>
                <span className="shrink-0 rounded-full border border-border bg-muted/50 text-muted-foreground px-2 py-1 text-[11px] font-semibold whitespace-nowrap">
                    {timeAgo(item.timestamp).replace(' ago', '')}
                </span>
            </div>
        </div>
    );
}
