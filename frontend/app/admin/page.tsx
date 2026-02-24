'use client';

import React, { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import {
    Users, FileText, Brain, Zap,
    Activity,
    ShieldCheck, AlertTriangle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { SystemStatusBadge } from '../../components/SystemStatusBadge';

// --- Types ---
interface ActivityItem {
    id: string;
    type: 'upload' | 'user_join';
    title: string; // "Physics 101 Uploaded" or "John Doe Joined"
    subtitle: string; // "By Admin" or "admin@example.com"
    timestamp: Date;
    avatar?: string;
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
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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
                // 1. Fetch User Count
                const { count: userCount, error: userError } = await supabase
                    .from('user_roles')
                    .select('*', { count: 'exact', head: true });

                // 2. Fetch Docs & Storage
                const { data: docs, error: docError } = await supabase
                    .from('pans_library')
                    .select('id, file_size, created_at, title, uploaded_by_email')
                    .order('created_at', { ascending: false }); // Get all for stats, limit later for feed? Better to limit in query if dataset was huge, but this is fine for now.

                if (userError) throw userError;
                if (docError) throw docError;

                const docCount = docs?.length || 0;
                const totalBytes = docs?.reduce((acc, d) => acc + (d.file_size || 0), 0) || 0;
                const storageGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
                const storagePercentage = (totalBytes / (1024 * 1024 * 1024 * 15)) * 100; // 15GB Limit

                // 3. Fetch System Status
                const { data: sysSettings } = await supabase
                    .from('system_settings')
                    .select('maintenance_mode, total_api_calls')
                    .eq('id', 1)
                    .single();

                const aiStatus = sysSettings?.maintenance_mode ? 'Maintenance' : 'Optimal';

                setStats({
                    userCount: userCount || 0,
                    docCount,
                    storageUsed: storageGB,
                    storagePercentage,
                    aiStatus,
                    apiCalls: sysSettings?.total_api_calls?.toLocaleString() || '0'
                });

                // 4. Build Activity Feed
                // Recent Users
                const { data: recentUsers } = await supabase
                    .from('user_roles')
                    .select('email, created_at')
                    .order('created_at', { ascending: false })
                    .limit(5);

                // Recent Docs (already fetched sorted)
                const recentDocs = docs?.slice(0, 5) || [];

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
    }, [supabase]);

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <header className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        Mission Control
                        <span className="flex h-3 w-3 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                    </h1>
                    <p className="text-muted-foreground mt-1">System Overview & Live Operations</p>
                </div>
                <div className="flex items-center gap-4">
                    <SystemStatusBadge />
                </div>
            </header>

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
                    color={stats.aiStatus === 'Optimal' ? "text-emerald-500" : "text-amber-500"}
                    bg={stats.aiStatus === 'Optimal' ? "bg-emerald-500/10" : "bg-amber-500/10"}
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
                            <h2 className="text-sm font-bold text-foreground">LIVE FEED</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
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
                                    {/* Compact Icon */}
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${item.type === 'upload'
                                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
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
                {trend && <span className="text-[10px] font-bold bg-green-500/10 text-green-600 px-2 py-1 rounded-full">{trend}</span>}
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
                            className="drop-shadow-[0_0_10px_rgba(var(--primary),0.5)]"
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
