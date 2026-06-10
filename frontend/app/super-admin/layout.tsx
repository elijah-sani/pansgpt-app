'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    Activity,
    Building2,
    ChevronLeft,
    Cpu,
    HeartPulse,
    LayoutDashboard,
    LogOut,
    Menu,
    MessageSquareWarning,
    Bell,
    PanelLeftClose,
    PanelLeftOpen,
    Search,
    ShieldAlert,
    UserCog,
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { fetchBootstrap } from '@/lib/bootstrap-cache';
import { clearAdminWorkspaceUniversity } from '@/lib/admin-workspace';
import { supabase } from '@/lib/supabase';

type SuperAdminNavItem = {
    icon: LucideIcon;
    label: string;
    href: string;
};

const navItems: SuperAdminNavItem[] = [
    { icon: LayoutDashboard, label: 'Overview', href: '/super-admin' },
    { icon: Building2, label: 'Universities', href: '/super-admin/universities' },
    { icon: UserCog, label: 'University Admins', href: '/super-admin/university-admins' },
    { icon: Cpu, label: 'AI Configuration', href: '/super-admin/ai-configuration' },
    { icon: MessageSquareWarning, label: 'Feedback', href: '/super-admin/feedback' },
    { icon: HeartPulse, label: 'System Health', href: '/super-admin/system-health' },
];

const mobileBottomNavItems: SuperAdminNavItem[] = [
    { icon: LayoutDashboard, label: 'Home', href: '/super-admin' },
    { icon: Building2, label: 'Universities', href: '/super-admin/universities' },
    { icon: UserCog, label: 'Admins', href: '/super-admin/university-admins' },
    { icon: Cpu, label: 'AI', href: '/super-admin/ai-configuration' },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userRole, setUserRole] = useState('Platform Admin');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mobileHeaderLocked, setMobileHeaderLocked] = useState(false);
    const mobileHeaderSentinelRef = React.useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const checkAccess = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const email = session?.user?.email;
            if (!email) {
                router.replace('/login');
                return;
            }

            const bootstrap = await fetchBootstrap();
            if (!bootstrap?.is_admin) {
                router.replace('/main');
                return;
            }
            if (bootstrap?.is_university_admin && !bootstrap?.is_super_admin && !bootstrap?.is_global_admin) {
                router.replace('/admin');
                return;
            }
            if (!bootstrap?.is_super_admin && !bootstrap?.is_global_admin) {
                router.replace('/admin');
                return;
            }

            clearAdminWorkspaceUniversity();
            setUserEmail(email);
            setUserRole(bootstrap?.is_super_admin ? 'Super Admin' : 'Legacy Platform Admin');
        };

        void checkAccess();
    }, [router]);

    useEffect(() => {
        const sentinel = mobileHeaderSentinelRef.current;
        if (!sentinel) return;

        const updateLockState = () => {
            setMobileHeaderLocked(sentinel.getBoundingClientRect().top <= 0);
        };

        updateLockState();
        window.addEventListener('scroll', updateLockState, { passive: true });
        window.addEventListener('resize', updateLockState);

        return () => {
            window.removeEventListener('scroll', updateLockState);
            window.removeEventListener('resize', updateLockState);
        };
    }, [pathname]);

    const handleSignOut = async () => {
        clearAdminWorkspaceUniversity();
        await supabase.auth.signOut();
        window.location.replace('/login');
    };

    if (!userEmail) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <img src="/icon.svg" alt="PansGPT" className="h-8 w-8 animate-pulse" />
                    <p className="text-xs font-medium text-muted-foreground">Verifying platform access...</p>
                </div>
            </div>
        );
    }

    const userInitial = userEmail.charAt(0).toUpperCase();
    const mobileTitle = getSuperAdminMobileTitle(pathname);
    const mobileDrawerWidthClass = 'translate-x-[min(19rem,86vw)]';
    const headerButtonClass = mobileHeaderLocked
        ? 'flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-foreground transition-transform duration-200'
        : 'flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-background/70 text-foreground transition-transform duration-200';
    const profileButtonClass = mobileHeaderLocked
        ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-white/10'
        : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background/70 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted';
    const mobileHeaderClass = [
        'fixed inset-x-0 top-0 z-50 min-h-[4.75rem] bg-background/95 backdrop-blur-md transition-shadow duration-200 md:hidden',
        mobileHeaderLocked ? 'shadow-[0_4px_20px_rgba(0,0,0,0.35)]' : 'shadow-none',
    ].join(' ');
    const mainClass = [
        'ml-0 flex flex-1 flex-col scroll-smooth overflow-x-hidden overflow-y-visible px-4 pt-2 pb-28 transition-[margin] duration-200 sm:px-5',
        'md:min-h-screen md:overflow-y-visible md:px-0 md:py-0 md:pb-0',
        sidebarCollapsed ? 'md:ml-20' : 'md:ml-72',
    ].join(' ');

    return (
        <div className="relative flex min-h-screen overflow-x-hidden bg-background text-foreground">
            <aside className={`fixed left-0 top-0 z-30 hidden h-full flex-col border-r border-border bg-card transition-[width] duration-200 md:flex ${sidebarCollapsed ? 'w-20' : 'w-72'}`}>
                <SuperAdminSidebar
                    pathname={pathname}
                    userEmail={userEmail}
                    userRole={userRole}
                    collapsed={sidebarCollapsed}
                    onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
                    onSignOut={handleSignOut}
                />
            </aside>

            <div className={`fixed inset-0 z-[70] md:hidden transition-opacity duration-300 ${mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
                <button
                    type="button"
                    aria-label="Close platform navigation"
                    className="absolute inset-0 bg-transparent"
                    onClick={() => setMobileOpen(false)}
                />
                <aside className={`absolute left-0 top-0 h-full w-[19rem] max-w-[86vw] border-r border-border bg-card/98 shadow-2xl transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <SuperAdminSidebar
                        pathname={pathname}
                        userEmail={userEmail}
                        userRole={userRole}
                        mobile
                        onNavigate={() => setMobileOpen(false)}
                        onSignOut={handleSignOut}
                    />
                </aside>
            </div>

            <main className={`${mainClass} transition-transform duration-300 ease-out md:translate-x-0 ${mobileOpen ? mobileDrawerWidthClass : 'translate-x-0'}`}>
                <div ref={mobileHeaderSentinelRef} className="h-3 md:hidden" />
                <div className="h-[4.75rem] md:hidden" />
                <div className={mobileHeaderClass}>
                    <div className="mx-auto flex min-h-[4.75rem] max-w-[48rem] items-center px-4 py-3 sm:px-5">
                        <div className="flex h-10 w-full items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => setMobileOpen((value) => !value)}
                                aria-label={mobileOpen ? 'Close platform navigation' : 'Open platform navigation'}
                                className={headerButtonClass}
                            >
                                {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                            </button>
                            <h1 className="truncate text-sm font-semibold tracking-wide text-foreground">{mobileTitle}</h1>
                            <span className={profileButtonClass}>
                                {userInitial}
                            </span>
                        </div>
                    </div>
                </div>
                <header className="sticky top-0 z-20 hidden items-center justify-between gap-4 border-b border-border bg-card/95 px-8 py-3 backdrop-blur-sm md:flex">
                    <div className="min-w-0">
                        <h1 className="truncate text-sm font-semibold">{mobileTitle}</h1>
                    </div>
                    <div className="flex flex-1 items-center justify-end gap-3">
                        <Link
                            href="/super-admin/search"
                            className="flex h-10 w-full max-w-md items-center gap-3 rounded-lg border border-border bg-background/80 px-3 text-sm text-muted-foreground transition-colors hover:border-amber-500/40 hover:text-foreground"
                        >
                            <Search className="h-4 w-4 text-amber-500" />
                            <span>Search platform...</span>
                        </Link>
                    <button
                        type="button"
                        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-amber-500"
                        aria-label="Notifications"
                        title="Notifications"
                    >
                        <Bell className="h-5 w-5" />
                        <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-amber-500" />
                    </button>
                    </div>
                </header>
                <div className="md:px-8 md:pb-8 md:pt-6">
                    {children}
                </div>
            </main>

            <>
                <div className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 h-20 bg-gradient-to-t from-background/95 via-background/60 to-transparent backdrop-blur-[4px] [mask-image:linear-gradient(to_top,black_0%,black_50%,transparent_100%)] transition-transform duration-300 md:hidden ${mobileOpen ? 'translate-y-24' : 'translate-y-0'}`} />
                <nav className={`fixed bottom-0 left-1/2 z-40 w-[calc(100%-2rem)] max-w-[30rem] -translate-x-1/2 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-2 transition-transform duration-300 md:hidden ${mobileOpen ? 'translate-y-28' : 'translate-y-0'}`}>
                    <div className="mx-auto flex items-center justify-center gap-3.5">
                        <div className="flex items-center gap-1.5 rounded-[2rem] border border-border/40 bg-background/95 px-2.5 py-2 backdrop-blur-xl">
                            {mobileBottomNavItems.map((item) => (
                                <SuperAdminMobileNavItem
                                    key={item.href}
                                    href={item.href}
                                    label={item.label}
                                    icon={item.icon}
                                    active={isActivePath(pathname, item.href)}
                                />
                            ))}
                        </div>
                        <Link
                            href="/super-admin/search"
                            aria-label="Search"
                            className={`flex h-[3.6rem] w-[3.6rem] shrink-0 items-center justify-center rounded-full border border-border/40 backdrop-blur-xl transition-all active:scale-95 ${
                                isActivePath(pathname, '/super-admin/search')
                                    ? 'bg-card text-foreground'
                                    : 'bg-background/95 text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Search className="h-[1.15rem] w-[1.15rem]" />
                        </Link>
                    </div>
                </nav>
            </>
        </div>
    );
}

function SuperAdminSidebar({
    pathname,
    userEmail,
    userRole,
    mobile = false,
    collapsed = false,
    onToggleCollapsed,
    onNavigate,
    onSignOut,
}: {
    pathname: string;
    userEmail: string;
    userRole: string;
    mobile?: boolean;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    onNavigate?: () => void;
    onSignOut: () => void;
}) {
    return (
        <div className="flex h-full flex-col">
            <div className={`flex h-[73px] items-center border-b border-border ${collapsed ? 'justify-center px-3' : 'justify-between gap-3 px-5'}`}>
                <div className={`flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                        <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
                        <h1 className="truncate text-sm font-semibold tracking-tight">PansGPT</h1>
                        <p className="text-[11px] font-medium uppercase text-muted-foreground">Super Admin Portal</p>
                    </div>
                </div>
                {onToggleCollapsed ? (
                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex ${collapsed ? 'absolute right-[-1rem] border border-border bg-background shadow-sm' : ''}`}
                        aria-label={collapsed ? 'Expand platform sidebar' : 'Collapse platform sidebar'}
                    >
                        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </button>
                ) : null}
            </div>

            <nav className={`flex-1 overflow-y-auto py-5 ${collapsed ? 'space-y-2 px-3' : 'space-y-1 px-3'}`}>
                {navItems.map((item) => (
                    <Link
                        key={item.href + item.label}
                        href={item.href}
                        onClick={onNavigate}
                        title={collapsed ? item.label : undefined}
                        className={`group relative flex h-10 w-full items-center rounded-md text-sm transition-colors ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${isActivePath(pathname, item.href) ? 'bg-amber-500/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                    >
                        {isActivePath(pathname, item.href) ? <span className="absolute left-0 top-2 h-6 w-0.5 rounded-r bg-amber-500" /> : null}
                        <item.icon className={`h-4 w-4 shrink-0 ${isActivePath(pathname, item.href) ? 'text-amber-500' : 'transition-colors group-hover:text-foreground'}`} />
                        {!collapsed ? <span className="truncate font-medium">{item.label}</span> : null}
                    </Link>
                ))}
            </nav>

            <div className={`border-t border-border ${collapsed ? 'p-3' : 'p-4'} ${mobile ? 'block' : 'block'}`}>
                <div className={`mb-3 flex items-center rounded-md bg-muted/60 py-2.5 ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}`}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-xs font-semibold text-amber-500 ring-1 ring-border">
                        {userEmail.charAt(0).toUpperCase()}
                    </div>
                    <div className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
                        <p className="truncate text-xs font-medium">{userEmail}</p>
                        <p className="text-[11px] text-muted-foreground">{userRole}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onSignOut}
                    title={collapsed ? 'Sign out' : undefined}
                    className={`flex h-9 w-full items-center rounded-md text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}`}
                >
                    <LogOut className="h-4 w-4" />
                    {!collapsed ? <span className="font-medium">Sign out</span> : null}
                </button>
            </div>
        </div>
    );
}

function isActivePath(pathname: string, href: string) {
    if (href === '/super-admin') return pathname === '/super-admin';
    return pathname === href || pathname.startsWith(`${href}/`);
}

function SuperAdminMobileNavItem({
    href,
    label,
    icon: Icon,
    active,
}: {
    href: string;
    label: string;
    icon: LucideIcon;
    active?: boolean;
}) {
    if (active) {
        return (
            <Link
                href={href}
                aria-current="page"
                className="flex min-w-[5rem] flex-col items-center justify-center rounded-full bg-card px-3 py-[0.65rem] text-foreground transition-transform active:scale-95"
            >
                <Icon className="h-[1.2rem] w-[1.2rem] shrink-0" />
                <span className="mt-1 truncate text-[0.6rem] font-medium leading-none tracking-[0.04em] text-zinc-200">{label}</span>
            </Link>
        );
    }

    return (
        <Link
            href={href}
            aria-label={label}
            className="flex h-[3rem] w-[3.2rem] shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:text-foreground active:scale-90"
        >
            <Icon className="h-[1.2rem] w-[1.2rem]" />
            <span className="sr-only">{label}</span>
        </Link>
    );
}

function getSuperAdminMobileTitle(pathname: string) {
    if (pathname === '/super-admin') return 'Home';
    if (pathname.startsWith('/super-admin/search')) return 'Search';
    if (pathname.startsWith('/super-admin/universities')) return 'Universities';
    if (pathname.startsWith('/super-admin/university-admins')) return 'University Admins';
    if (pathname.startsWith('/super-admin/ai-configuration')) return 'AI Configuration';
    if (pathname.startsWith('/super-admin/feedback')) return 'Feedback';
    if (pathname.startsWith('/super-admin/system-health')) return 'System Health';
    return 'Super Admin';
}
