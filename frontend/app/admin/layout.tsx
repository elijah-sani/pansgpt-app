'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    BookOpenCheck,
    CalendarDays,
    LayoutDashboard,
    Library,
    Menu,
    MessageSquareWarning,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    ShieldCheck,
    UserCog,
    Users,
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type AdminNavItem = {
    icon: LucideIcon;
    label: string;
    href: string;
};

type AdminNavSection = {
    label: string;
    items: AdminNavItem[];
};

const navSections: AdminNavSection[] = [
    {
        label: 'Overview',
        items: [
            { icon: LayoutDashboard, label: 'Dashboard', href: '/admin' },
            { icon: Library, label: 'Library', href: '/admin/library' },
            { icon: Users, label: 'Students', href: '/admin/students' },
        ],
    },
    {
        label: 'Academic',
        items: [
            { icon: CalendarDays, label: 'Timetable', href: '/admin/timetable' },
            { icon: BookOpenCheck, label: 'Faculty Knowledge', href: '/admin/faculty-knowledge' },
        ],
    },
    {
        label: 'System',
        items: [
            { icon: MessageSquareWarning, label: 'Feedback', href: '/admin/feedback' },
            { icon: UserCog, label: 'Admin Users', href: '/admin/users' },
            { icon: Settings, label: 'Settings', href: '/admin/settings' },
        ],
    },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

            const response = await api.get('/me/bootstrap');
            if (!response.ok) {
                console.warn(`Unauthorized access attempt by: ${email}`);
                router.push('/');
                return;
            }

            const data = await response.json();
            if (!data?.is_admin) {
                console.warn(`Unauthorized access attempt by: ${email}`);
                router.push('/');
                return;
            }

            setUserEmail(email);
            setUserRole(data?.is_super_admin ? 'Super Admin' : 'Admin');
        };

        checkAuth();
    }, [router]);

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    if (!userEmail) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <img src="/icon.svg" alt="PansGPT" className="h-8 w-8 animate-pulse" />
                    <p className="text-xs font-medium text-muted-foreground">Verifying access...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-muted/20 text-foreground font-sans selection:bg-primary/30">
            <aside className={`fixed left-0 top-0 z-20 hidden h-full flex-col border-r border-border bg-background transition-[width] duration-200 md:flex ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
                <AdminSidebarContent
                    pathname={pathname}
                    userEmail={userEmail}
                    userRole={userRole}
                    collapsed={sidebarCollapsed}
                    onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
                />
            </aside>

            <div className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-md md:hidden">
                <div className="flex items-center gap-3">
                    <img src="/icon.svg" alt="PansGPT" className="h-8 w-8 object-contain" />
                    <div>
                        <h1 className="text-base font-semibold tracking-tight">Admin Console</h1>
                        <p className="text-xs text-muted-foreground">PansGPT operations</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground"
                    aria-label="Open admin navigation"
                >
                    <Menu className="h-4 w-4" />
                </button>
            </div>

            {mobileOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                    <button
                        type="button"
                        aria-label="Close admin navigation"
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setMobileOpen(false)}
                    />
                    <aside className="absolute left-0 top-0 h-full w-[19rem] max-w-[86vw] border-r border-border bg-background shadow-xl">
                        <div className="absolute right-3 top-3">
                            <button
                                type="button"
                                onClick={() => setMobileOpen(false)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Close admin navigation"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <AdminSidebarContent pathname={pathname} userEmail={userEmail} userRole={userRole} />
                    </aside>
                </div>
            )}

            <main className={`ml-0 flex-1 overflow-y-auto p-4 pt-20 transition-[margin] duration-200 md:p-8 md:pt-8 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
                {children}
            </main>
        </div>
    );
}

function AdminSidebarContent({
    pathname,
    userEmail,
    userRole,
    collapsed = false,
    onToggleCollapsed,
}: {
    pathname: string;
    userEmail: string | null;
    userRole: string | null;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
}) {
    return (
        <div className="flex h-full flex-col">
            <div className={`flex h-[73px] items-center border-b border-border ${collapsed ? 'justify-center px-3' : 'justify-between gap-3 px-5'}`}>
                <div className={`flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
                <img src="/icon.svg" alt="PansGPT" className="h-8 w-8 shrink-0 object-contain" />
                <div className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
                    <h1 className="truncate text-sm font-semibold tracking-tight">PansGPT</h1>
                    <p className="text-[11px] font-medium uppercase text-muted-foreground">Admin Console</p>
                </div>
                </div>
                {onToggleCollapsed && (
                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex ${collapsed ? 'absolute right-[-1rem] border border-border bg-background shadow-sm' : ''}`}
                        aria-label={collapsed ? 'Expand admin sidebar' : 'Collapse admin sidebar'}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </button>
                )}
            </div>

            <nav className={`flex-1 overflow-y-auto py-5 ${collapsed ? 'space-y-3 px-3' : 'space-y-6 px-3'}`}>
                {navSections.map((section, sectionIndex) => (
                    <div key={section.label}>
                        {collapsed ? (
                            sectionIndex > 0 ? <div className="mx-auto mb-2 h-px w-8 bg-border" /> : null
                        ) : (
                            <p className="px-3 pb-2 text-[11px] font-semibold uppercase text-muted-foreground">
                                {section.label}
                            </p>
                        )}
                        <div className="space-y-1">
                            {section.items.map((item) => (
                                <SidebarItem
                                    key={item.href}
                                    icon={item.icon}
                                    label={item.label}
                                    href={item.href}
                                    active={isActivePath(pathname, item.href)}
                                    collapsed={collapsed}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            <div className={`border-t border-border ${collapsed ? 'p-3' : 'p-4'}`}>
                <div className={`mb-3 flex items-center rounded-md bg-muted/60 py-2.5 ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}`}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-xs font-semibold text-primary ring-1 ring-border">
                        {userEmail ? userEmail.charAt(0).toUpperCase() : 'A'}
                    </div>
                    <div className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
                        <p className="truncate text-xs font-medium">{userEmail}</p>
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <ShieldCheck className="h-3 w-3" />
                            {userRole ?? 'Admin'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function isActivePath(pathname: string, href: string) {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarItem({
    icon: Icon,
    label,
    href,
    active,
    collapsed,
}: {
    icon: LucideIcon;
    label: string;
    href: string;
    active?: boolean;
    collapsed?: boolean;
}) {
    return (
        <Link
            href={href}
            title={collapsed ? label : undefined}
            className={`group relative flex h-10 w-full items-center rounded-md text-sm transition-colors ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
        >
            {active && <span className="absolute left-0 top-2 h-6 w-0.5 rounded-r bg-primary" />}
            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'transition-colors group-hover:text-foreground'}`} />
            {!collapsed && <span className="truncate font-medium">{label}</span>}
        </Link>
    );
}
