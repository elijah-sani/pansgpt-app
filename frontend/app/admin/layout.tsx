'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    BookOpenCheck,
    CalendarDays,
    FileCheck2,
    Home,
    LayoutDashboard,
    Library,
    Menu,
    MessageSquareWarning,
    Search,
    Settings,
    ShieldAlert,
    ShieldCheck,
    UserCheck,
    UserCog,
    Users,
    X,
    PanelLeftClose,
    PanelLeftOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchBootstrap } from '@/lib/bootstrap-cache';
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
            { icon: LayoutDashboard, label: 'Home', href: '/admin' },
            { icon: Library, label: 'Library', href: '/admin/library' },
            { icon: Users, label: 'Students', href: '/admin/students' },
        ],
    },
    {
        label: 'Academic',
        items: [
            { icon: UserCheck, label: 'Lecturers', href: '/admin/lecturers' },
            { icon: FileCheck2, label: 'Material Submissions', href: '/admin/material-submissions' },
            { icon: ShieldAlert, label: 'Restrictions', href: '/admin/restrictions' },
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

const mobileNavItems: AdminNavItem[] = [
    { icon: Home, label: 'Home', href: '/admin' },
    { icon: Library, label: 'Library', href: '/admin/library' },
    { icon: FileCheck2, label: 'Materials', href: '/admin/material-submissions' },
    { icon: MessageSquareWarning, label: 'Feedback', href: '/admin/feedback' },
];

const mobileBottomNavItems: AdminNavItem[] = [
    { icon: Home, label: 'Home', href: '/admin' },
    { icon: Library, label: 'Library', href: '/admin/library' },
    { icon: FileCheck2, label: 'Materials', href: '/admin/material-submissions' },
    { icon: MessageSquareWarning, label: 'Feedback', href: '/admin/feedback' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileHeaderLocked, setMobileHeaderLocked] = useState(false);
    const mobileHeaderSentinelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const checkAuth = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session) {
                router.push('/');
                return;
            }

            const email = session.user.email;
            if (!email) {
                router.push('/');
                return;
            }

            const data = await fetchBootstrap();
            if (!data) {
                console.warn(`Unauthorized access attempt by: ${email}`);
                router.push('/');
                return;
            }
            if (!data?.is_admin) {
                console.warn(`Unauthorized access attempt by: ${email}`);
                router.push('/');
                return;
            }

            setUserEmail(email);
            setUserRole(data?.is_super_admin ? 'Super Admin' : 'Admin');
        };

        void checkAuth();
    }, [router]);

    useEffect(() => {
        const sentinel = mobileHeaderSentinelRef.current;
        if (!sentinel) {
            return;
        }

        const updateLockState = () => {
            const top = sentinel.getBoundingClientRect().top;
            setMobileHeaderLocked(top <= 0);
        };

        updateLockState();
        window.addEventListener('scroll', updateLockState, { passive: true });
        window.addEventListener('resize', updateLockState);

        return () => {
            window.removeEventListener('scroll', updateLockState);
            window.removeEventListener('resize', updateLockState);
        };
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

    const userInitial = userEmail.charAt(0).toUpperCase();
    const mobileTitle = getAdminMobileTitle(pathname);
    const isSearchPage = pathname.startsWith('/admin/search');
    const hideMobileHeader = isSearchPage;
    const hideMobileNav = isSearchPage;
    const headerButtonClass = mobileHeaderLocked
        ? 'flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-foreground'
        : 'flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-background/70 text-foreground';
    const profileButtonClass = mobileHeaderLocked
        ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-white/10'
        : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background/70 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted';
    const mobileHeaderClass = [
        'sticky top-0 z-50 -mx-4 mb-6 min-h-[4.75rem] bg-background/95 backdrop-blur-md transition-shadow duration-200 sm:-mx-5 md:hidden',
        mobileHeaderLocked ? 'shadow-[0_4px_20px_rgba(0,0,0,0.35)]' : 'shadow-none',
    ].join(' ');
    const mainClass = [
        'ml-0 flex flex-1 flex-col scroll-smooth overflow-visible px-4 pt-2 transition-[margin] duration-200 sm:px-5',
        hideMobileNav ? 'pb-0' : 'pb-28',
        'md:h-screen md:overflow-y-auto md:p-8 md:pb-8 md:pt-8',
        sidebarCollapsed ? 'md:ml-20' : 'md:ml-64',
    ].join(' ');

    return (
        <div className="flex min-h-screen bg-background font-sans text-foreground selection:bg-primary/30">
            <aside className={`fixed left-0 top-0 z-20 hidden h-full flex-col border-r border-border bg-card transition-[width] duration-200 md:flex ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
                <AdminSidebarContent
                    pathname={pathname}
                    userEmail={userEmail}
                    userRole={userRole}
                    collapsed={sidebarCollapsed}
                    onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
                />
            </aside>

            {mobileOpen ? (
                <div className="fixed inset-0 z-[70] md:hidden">
                    <button
                        type="button"
                        aria-label="Close admin navigation"
                        className="absolute inset-0 bg-black/45"
                        onClick={() => setMobileOpen(false)}
                    />
                    <aside className="absolute left-0 top-0 h-full w-[19rem] max-w-[86vw] border-r border-border bg-card shadow-xl">
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
                        <AdminSidebarContent
                            pathname={pathname}
                            userEmail={userEmail}
                            userRole={userRole}
                            mobile
                            onNavigate={() => setMobileOpen(false)}
                        />
                    </aside>
                </div>
            ) : null}

            <main className={mainClass}>
                {hideMobileHeader ? null : (
                    <>
                        <div ref={mobileHeaderSentinelRef} className="h-3 md:hidden" />
                        <div className={mobileHeaderClass}>
                        <div className="flex min-h-[4.75rem] items-center px-4 py-3 sm:px-5">
                                <div className="flex h-10 w-full items-center justify-between gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setMobileOpen(true)}
                                        aria-label="Open admin navigation"
                                        className={headerButtonClass}
                                    >
                                        <Menu className="h-4 w-4" />
                                    </button>
                                    <h1 className="truncate text-sm font-semibold tracking-wide text-foreground">{mobileTitle}</h1>
                                    <Link href="/admin/settings" aria-label="Open admin profile" className={profileButtonClass}>
                                        {userInitial}
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {children}
            </main>

            {hideMobileNav ? null : (
                <>
                    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-20 bg-gradient-to-t from-background/95 via-background/60 to-transparent backdrop-blur-[4px] [mask-image:linear-gradient(to_top,black_0%,black_50%,transparent_100%)] md:hidden" />
                    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-2 md:hidden">
                    <div className="mx-auto flex max-w-[30rem] items-center justify-center gap-3.5">
                        <div className="flex items-center gap-1.5 rounded-[2rem] border border-border/40 bg-background/95 px-2.5 py-2 backdrop-blur-xl">
                            {mobileBottomNavItems.map((item) => (
                                <AdminMobileNavItem
                                    key={item.href}
                                    href={item.href}
                                    label={item.label}
                                    icon={item.icon}
                                    active={isActivePath(pathname, item.href)}
                                />
                            ))}
                        </div>
                        <Link
                            href="/admin/search"
                            aria-label="Search"
                            className={`flex h-[3.6rem] w-[3.6rem] shrink-0 items-center justify-center rounded-full border border-border/40 backdrop-blur-xl transition-all active:scale-95 ${
                                isActivePath(pathname, '/admin/search')
                                    ? 'bg-card text-foreground'
                                    : 'bg-background/95 text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Search className="h-[1.15rem] w-[1.15rem]" />
                        </Link>
                    </div>
                    </nav>
                </>
            )}
        </div>
    );
}

function AdminSidebarContent({
    pathname,
    userEmail,
    userRole,
    mobile = false,
    collapsed = false,
    onToggleCollapsed,
    onNavigate,
}: {
    pathname: string;
    userEmail: string | null;
    userRole: string | null;
    mobile?: boolean;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    onNavigate?: () => void;
}) {
    const visibleSections = navSections
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => {
                if (!mobile) return true;
                return !['/admin', '/admin/library', '/admin/material-submissions', '/admin/feedback'].includes(item.href);
            }),
        }))
        .filter((section) => section.items.length > 0);

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
                {onToggleCollapsed ? (
                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex ${collapsed ? 'absolute right-[-1rem] border border-border bg-background shadow-sm' : ''}`}
                        aria-label={collapsed ? 'Expand admin sidebar' : 'Collapse admin sidebar'}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </button>
                ) : null}
            </div>

            <nav className={`flex-1 overflow-y-auto py-5 ${collapsed ? 'space-y-3 px-3' : 'space-y-6 px-3'}`}>
                {visibleSections.map((section, sectionIndex) => (
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
                                    onNavigate={onNavigate}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            <div className={`border-t border-border ${collapsed ? 'p-3' : 'p-4'} ${mobile ? 'hidden' : 'block'}`}>
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

function SidebarItem({
    icon: Icon,
    label,
    href,
    active,
    collapsed,
    onNavigate,
}: {
    icon: LucideIcon;
    label: string;
    href: string;
    active?: boolean;
    collapsed?: boolean;
    onNavigate?: () => void;
}) {
    return (
        <Link
            href={href}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={`group relative flex h-10 w-full items-center rounded-md text-sm transition-colors ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
        >
            {active ? <span className="absolute left-0 top-2 h-6 w-0.5 rounded-r bg-primary" /> : null}
            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'transition-colors group-hover:text-foreground'}`} />
            {!collapsed ? <span className="truncate font-medium">{label}</span> : null}
        </Link>
    );
}

function AdminMobileNavItem({
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

function isActivePath(pathname: string, href: string) {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
}

function getAdminMobileTitle(pathname: string) {
    if (pathname === '/admin') return 'Home';
    if (pathname.startsWith('/admin/library')) return 'Library';
    if (pathname.startsWith('/admin/students')) return 'Students';
    if (pathname.startsWith('/admin/search')) return 'Search';
    if (pathname.startsWith('/admin/lecturers')) return 'Lecturers';
    if (pathname.startsWith('/admin/material-submissions')) return 'Materials';
    if (pathname.startsWith('/admin/restrictions')) return 'Restrictions';
    if (pathname.startsWith('/admin/timetable')) return 'Timetable';
    if (pathname.startsWith('/admin/faculty-knowledge')) return 'Faculty Knowledge';
    if (pathname.startsWith('/admin/feedback')) return 'Feedback';
    if (pathname.startsWith('/admin/users')) return 'Admin Users';
    if (pathname.startsWith('/admin/settings')) return 'Settings';
    return 'Admin';
}
