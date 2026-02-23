'use client';

import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Library, Users, Settings, ArrowRight, MessageSquareWarning } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const router = useRouter();
    const pathname = usePathname();
    const [userEmail, setUserEmail] = useState<string | null>(null);

    // --- Auth Check ---
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/');
                return;
            }
            const email = session.user.email;

            if (!email) {
                router.push('/');
                return;
            }

            // Check DB for Permissions
            const { data: roleData, error } = await supabase
                .from('user_roles')
                .select('role')
                .eq('email', email)
                .maybeSingle();

            if (error || !roleData) {
                console.warn(`Unauthorized access attempt by: ${email}`);
                router.push('/');
                return;
            }

            setUserEmail(email);
        };
        checkAuth();
    }, [router, supabase]);

    if (!userEmail) return null; // Wait for auth

    return (
        <div className="flex min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">

            {/* Desktop Sidebar (Hidden on Mobile) */}
            <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 border-r border-border bg-background/50 backdrop-blur-xl z-20 flex-col">
                <div className="flex items-center gap-3 p-6 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                        <div className="w-3 h-3 bg-white rounded-full" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">PansGPT</h1>
                        <p className="text-xs text-muted-foreground font-medium">ADMIN CONSOLE</p>
                    </div>
                </div>

                <nav className="space-y-1 px-3 flex-1">
                    <SidebarItem icon={LayoutDashboard} label="Dashboard" href="/admin" active={pathname === '/admin'} />
                    <SidebarItem icon={Library} label="Library" href="/admin/library" active={pathname === '/admin/library'} />
                    <SidebarItem icon={Users} label="Personnel" href="/admin/users" active={pathname === '/admin/users'} />
                    <SidebarItem icon={MessageSquareWarning} label="User Feedback" href="/admin/feedback" active={pathname === '/admin/feedback'} />
                    <SidebarItem icon={Settings} label="Settings" href="/admin/settings" active={pathname === '/admin/settings'} />
                </nav>

                <div className="p-6 border-t border-border/50">
                    <a
                        href="/"
                        target="_blank"
                        className="flex items-center justify-center gap-2 w-full p-2 mb-4 text-xs font-bold text-muted-foreground hover:text-primary transition-colors border border-dashed border-border rounded-lg hover:bg-primary/5 hover:border-primary/20"
                    >
                        <ArrowRight className="w-3 h-3" />
                        View Application
                    </a>

                    <div className="text-center mt-2">
                        <span className="text-[10px] text-muted-foreground font-medium opacity-50">System v1.0.2 • Stable</span>
                    </div>
                </div>
            </aside>

            {/* Mobile Header (Fixed Top) */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-background/90 backdrop-blur-md border-b border-border flex items-center justify-between px-4 z-40">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                        <div className="w-3 h-3 bg-white rounded-full" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">PansGPT</h1>
                        <p className="text-[10px] text-muted-foreground font-medium tracking-wider">ADMIN CONSOLE</p>
                    </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-xs text-primary font-bold">
                        {userEmail ? userEmail.charAt(0).toUpperCase() : 'A'}
                    </span>
                </div>
            </div>

            {/* Mobile Bottom Navigation (Visible only on Mobile) */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-t border-border pb-safe">
                <div className="flex justify-around items-center p-2">
                    <BottomNavItem icon={LayoutDashboard} label="Home" href="/admin" active={pathname === '/admin'} />
                    <BottomNavItem icon={Library} label="Library" href="/admin/library" active={pathname === '/admin/library'} />
                    <BottomNavItem icon={Users} label="Personnel" href="/admin/users" active={pathname === '/admin/users'} />
                    <BottomNavItem icon={MessageSquareWarning} label="Feedback" href="/admin/feedback" active={pathname === '/admin/feedback'} />
                    <BottomNavItem icon={Settings} label="Settings" href="/admin/settings" active={pathname === '/admin/settings'} />
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 ml-0 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 pb-24 md:pb-8 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}

function SidebarItem({ icon: Icon, label, href, active }: { icon: LucideIcon, label: string, href: string, active?: boolean }) {
    return (
        <Link
            href={href}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
        >
            {active && (
                <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/5 border-l-2 border-primary rounded-r-xl"
                />
            )}
            <Icon className={`w-5 h-5 ${active ? 'text-primary' : 'group-hover:text-primary/70 transition-colors'}`} />
            <span className="font-medium relative z-10">{label}</span>
        </Link>
    );
}

function BottomNavItem({ icon: Icon, label, href, active }: { icon: LucideIcon, label: string, href: string, active?: boolean }) {
    return (
        <Link href={href} className="flex flex-col items-center gap-1 p-2 flex-1">
            <div className={`p-1.5 rounded-full ${active ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}>
                <Icon className="w-5 h-5" />
            </div>
            <span className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                {label}
            </span>
        </Link>
    );
}
