'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    BookOpenCheck,
    CalendarDays,
    ChevronLeft,
    FileCheck2,
    GraduationCap,
    LayoutDashboard,
    Library,
    Menu,
    Search,
    ShieldAlert,
    UserCheck,
    Users,
    X,
    PanelLeftClose,
    PanelLeftOpen,
    ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchBootstrap } from '@/lib/bootstrap-cache';
import {
    clearAdminWorkspaceUniversity,
    getAdminWorkspaceUniversityId,
    getAdminWorkspaceUniversityName,
    setAdminWorkspaceUniversityId,
} from '@/lib/admin-workspace';
import { supabase } from '@/lib/supabase';
import UniversitySuspendedBlocker from '@/components/UniversitySuspendedBlocker';

type AdminNavItem = {
    icon: LucideIcon;
    label: string;
    href: string;
    /** If true, only Senior Admins and Super Admins can see this link */
    seniorAdminOnly?: boolean;
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
            { icon: Users, label: 'Students', href: '/admin/students', seniorAdminOnly: true },
            { icon: ShieldCheck, label: 'Admins', href: '/admin/admins', seniorAdminOnly: true },
        ],
    },
    {
        label: 'Academic',
        items: [
            { icon: UserCheck, label: 'Lecturers', href: '/admin/lecturers', seniorAdminOnly: true },
            { icon: FileCheck2, label: 'Material Submissions', href: '/admin/material-submissions' },
            { icon: ShieldAlert, label: 'Restrictions', href: '/admin/restrictions' },
            { icon: CalendarDays, label: 'Timetable', href: '/admin/timetable' },
            { icon: BookOpenCheck, label: 'Faculty Knowledge', href: '/admin/faculty-knowledge' },
            { icon: CalendarDays, label: 'Academic Context', href: '/admin/settings', seniorAdminOnly: true },
        ],
    },
    {
        label: 'Workspace',
        items: [
            { icon: GraduationCap, label: 'Student App', href: '/main' },
        ],
    },
];


export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [isSeniorAdmin, setIsSeniorAdmin] = useState(false);
    const [workspaceName, setWorkspaceName] = useState('');
    const [mobileOpen, setMobileOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
    const [mobileHeaderLocked, setMobileHeaderLocked] = useState(false);
    const [isUniversitySuspended, setIsUniversitySuspended] = useState(false);
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

            if (data?.is_global_admin && !data?.is_super_admin && !data?.is_university_admin) {
                router.replace('/super-admin');
                return;
            }

            if (data?.is_super_admin && !getAdminWorkspaceUniversityId()) {
                router.replace('/super-admin');
                return;
            }

            setUserEmail(email);
            const superAdmin = Boolean(data?.is_super_admin);
            const seniorAdmin = Boolean(data?.is_senior_university_admin || data?.admin_level === 'senior');
            setIsSuperAdmin(superAdmin);
            setIsSeniorAdmin(seniorAdmin);
            if (!data?.is_super_admin) {
                setAdminWorkspaceUniversityId('');
            }
            setWorkspaceName(data?.is_super_admin ? getAdminWorkspaceUniversityName() : (data?.university_name || data?.profile?.university || 'University Workspace'));
            setUserRole(superAdmin ? 'Super Admin' : seniorAdmin ? 'Senior Admin' : 'Admin');

            // University suspension gate for university admins.
            // Super admins can still access the admin panel to manage universities.
            if (data?.is_university_suspended && !data?.is_super_admin) {
                setIsUniversitySuspended(true);
            }
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

    if (isUniversitySuspended) {
        const handleLogout = async () => {
            clearAdminWorkspaceUniversity();
            await supabase.auth.signOut();
            window.location.replace('/login');
        };
        return <UniversitySuspendedBlocker onLogout={() => void handleLogout()} />;
    }

    const userInitial = userEmail.charAt(0).toUpperCase();
    const mobileTitle = getAdminMobileTitle(pathname);
    const isSearchPage = pathname.startsWith('/admin/search');
    const hideMobileHeader = isSearchPage;
    const hideMobileNav = isSearchPage;
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
    const mobileDrawerWidthClass = 'translate-x-[min(19rem,86vw)]';
    const isLibraryPage = pathname.startsWith('/admin/library');
    const mainClass = [
        isLibraryPage
            ? 'ml-0 flex h-[100dvh] flex-1 flex-col scroll-smooth transition-[margin] duration-200 overflow-x-hidden overflow-y-hidden px-0 pt-2 sm:px-0 lg:h-screen lg:overflow-hidden lg:p-0'
            : 'ml-0 flex flex-1 flex-col scroll-smooth overflow-x-hidden overflow-y-visible px-4 pt-2 pb-6 transition-[margin] duration-200 sm:px-5',
        isLibraryPage
            ? 'lg:h-screen lg:overflow-hidden lg:p-0'
            : 'md:min-h-screen md:overflow-y-visible md:p-8 md:pb-8 md:pt-8',
        sidebarCollapsed ? 'md:ml-20' : 'md:ml-64',
    ].join(' ');

    const handleExitWorkspace = () => {
        clearAdminWorkspaceUniversity();
        router.push('/super-admin');
    };

    return (
        <div className="relative flex min-h-screen overflow-x-hidden bg-background font-sans text-foreground selection:bg-primary/30">
            <aside className={`fixed left-0 top-0 z-20 hidden h-full flex-col border-r border-border bg-card transition-[width] duration-200 md:flex ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
                <AdminSidebarContent
                    pathname={pathname}
                    userEmail={userEmail}
                    userRole={userRole}
                    isSeniorAdmin={isSeniorAdmin}
                    isSuperAdmin={isSuperAdmin}
                    collapsed={sidebarCollapsed}
                    onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
                />
            </aside>

            <div className={`fixed inset-0 z-[70] md:hidden transition-opacity duration-300 ${mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
                <button
                    type="button"
                    aria-label="Close admin navigation"
                    className="absolute inset-0 bg-transparent"
                    onClick={() => setMobileOpen(false)}
                />
                <aside className={`absolute left-0 top-0 h-full w-[19rem] max-w-[86vw] border-r border-border bg-card/98 shadow-2xl transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <AdminSidebarContent
                        pathname={pathname}
                        userEmail={userEmail}
                        userRole={userRole}
                        isSeniorAdmin={isSeniorAdmin}
                        isSuperAdmin={isSuperAdmin}
                        mobile
                        onNavigate={() => setMobileOpen(false)}
                    />
                </aside>
            </div>

            <main className={`${mainClass} transition-transform duration-300 ease-out ${mobileOpen ? mobileDrawerWidthClass : ''}`}>
                {isSuperAdmin ? (
                    <div className="mb-4 hidden rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 md:flex md:items-center md:justify-between">
                        <span>Viewing {workspaceName || 'selected university'} as Super Admin</span>
                        <div className="flex items-center gap-2">
                            <Link href="/super-admin/universities" className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-bold hover:bg-amber-500/10">
                                Change University
                            </Link>
                            <button type="button" onClick={handleExitWorkspace} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">
                                Exit Workspace
                            </button>
                        </div>
                    </div>
                ) : null}
                {hideMobileHeader ? null : (
                    <>
                        <div ref={mobileHeaderSentinelRef} className="h-3 md:hidden" />
                        <div className="h-[4.75rem] md:hidden" />
                        <div className={mobileHeaderClass}>
                        <div className="mx-auto flex min-h-[4.75rem] max-w-[48rem] items-center px-4 py-3 sm:px-5">
                                <div className="flex h-10 w-full items-center justify-between gap-3">
                                    {pathname === '/admin/profile' ? (
                                        <button
                                            type="button"
                                            onClick={() => router.back()}
                                            aria-label="Go back"
                                            className={headerButtonClass}
                                        >
                                            <ChevronLeft className="h-5 w-5" />
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setMobileOpen((value) => !value)}
                                            aria-label={mobileOpen ? 'Close admin navigation' : 'Open admin navigation'}
                                            className={headerButtonClass}
                                        >
                                            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                                        </button>
                                    )}
                                    <h1 className="truncate text-sm font-semibold tracking-wide text-foreground">{mobileTitle}</h1>
                                    {pathname === '/admin/profile' ? (
                                        <div className="w-10" />
                                    ) : (
                                        <Link href="/admin/profile" aria-label="Open admin profile" className={profileButtonClass}>
                                            {userInitial}
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {children}
            </main>
        </div>
    );
}

function AdminSidebarContent({
    pathname,
    userEmail,
    userRole,
    isSeniorAdmin = false,
    isSuperAdmin = false,
    mobile = false,
    collapsed = false,
    onToggleCollapsed,
    onNavigate,
}: {
    pathname: string;
    userEmail: string | null;
    userRole: string | null;
    isSeniorAdmin?: boolean;
    isSuperAdmin?: boolean;
    mobile?: boolean;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    onNavigate?: () => void;
}) {
    const canSeeSeniorLinks = isSuperAdmin || isSeniorAdmin;

    const visibleSections = navSections
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => {
                // Role-based filter: hide senior-only links from standard admins
                if (item.seniorAdminOnly && !canSeeSeniorLinks) return false;
                return true;
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
                <Link
                    href="/admin/profile"
                    className={`mb-3 flex items-center rounded-md bg-muted/60 py-2.5 transition-colors hover:bg-muted/80 ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}`}
                >
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
                </Link>
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
    if (pathname.startsWith('/admin/settings')) return 'University Settings';
    if (pathname.startsWith('/admin/profile')) return 'Profile';
    return 'Admin';
}
