'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  CircleHelp,
  FileStack,
  House,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { fetchBootstrap } from '@/lib/bootstrap-cache';
import { supabase } from '@/lib/supabase';
import UniversitySuspendedBlocker from '@/components/UniversitySuspendedBlocker';

type LecturerStatus = 'pending' | 'active' | 'rejected' | 'suspended' | 'revoked';

type LecturerBootstrap = {
  is_admin?: boolean;
  is_super_admin?: boolean;
  is_lecturer?: boolean;
  lecturer_status?: LecturerStatus | null;
  lecturer_profile?: {
    title?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone_number?: string | null;
    university_name?: string | null;
    status?: LecturerStatus | null;
  } | null;
};

type GuardState =
  | { status: 'allowed'; bootstrap: LecturerBootstrap; userEmail: string | null }
  | { status: 'blocked'; bootstrap: LecturerBootstrap };

type LecturerNavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
};

const lecturerSidebarNavItems: LecturerNavItem[] = [
  { icon: House, label: 'Home', href: '/lecturer' },
  { icon: BookOpenCheck, label: 'Restrictions', href: '/lecturer/restrictions' },
  { icon: FileStack, label: 'Materials', href: '/lecturer/materials' },
  { icon: CircleHelp, label: 'Help', href: '/lecturer/help' },
];

const lecturerMobileNavItems: LecturerNavItem[] = [
  { icon: House, label: 'Home', href: '/lecturer' },
  { icon: BookOpenCheck, label: 'Restrictions', href: '/lecturer/restrictions' },
  { icon: FileStack, label: 'Materials', href: '/lecturer/materials' },
];

export default function LecturerProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [guardState, setGuardState] = useState<GuardState>({ status: 'allowed', bootstrap: {}, userEmail: null });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileHeaderLocked, setMobileHeaderLocked] = useState(false);
  const [isUniversitySuspended, setIsUniversitySuspended] = useState(false);
  const mobileHeaderSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    const verifyAccess = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace('/login');
        return;
      }

      const sessionEmail = session.user.email || null;

      try {
        const bootstrap = await fetchBootstrap();
        if (!bootstrap) {
          router.replace('/main');
          return;
        }
        const lecturerStatus = bootstrap.lecturer_status;

        // University suspension gate — checked before lecturer-status gating.
        if (bootstrap.is_university_suspended) {
          if (active) {
            setIsUniversitySuspended(true);
            setGuardState({ status: 'allowed', bootstrap, userEmail: sessionEmail });
          }
          return;
        }

        if (bootstrap?.is_admin || bootstrap?.is_super_admin) {
          router.replace('/admin');
          return;
        }

        if (!bootstrap?.is_lecturer || !lecturerStatus) {
          router.replace('/main');
          return;
        }

        if (lecturerStatus === 'active') {
          if (pathname === '/lecturer/pending') {
            router.replace('/lecturer/restrictions');
            return;
          }
          if (active) {
            setGuardState({ status: 'allowed', bootstrap, userEmail: sessionEmail });
          }
          return;
        }

        if (lecturerStatus === 'pending') {
          if (pathname !== '/lecturer/pending') {
            router.replace('/lecturer/pending');
            return;
          }
          if (active) {
            setGuardState({ status: 'allowed', bootstrap, userEmail: sessionEmail });
          }
          return;
        }

        if (active) {
          setGuardState({ status: 'blocked', bootstrap });
        }
      } catch (error) {
        console.error('Lecturer access check failed:', error);
        router.replace('/main');
      }
    };

    void verifyAccess();

    return () => {
      active = false;
    };
  }, [pathname, router]);

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

  const blockedCopy = useMemo(() => {
    if (guardState.status !== 'blocked') {
      return null;
    }

    const status = guardState.bootstrap.lecturer_status;
    if (status === 'rejected') {
      return {
        title: 'Lecturer access not approved',
        message: 'Your lecturer profile was rejected. Please contact the PansGPT admin team if you need this reviewed again.',
      };
    }
    if (status === 'suspended') {
      return {
        title: 'Lecturer access suspended',
        message: 'Your lecturer access is temporarily suspended. Please contact the PansGPT admin team for clarification.',
      };
    }
    return {
      title: 'Lecturer access revoked',
      message: 'Your lecturer access is no longer active. Please contact the PansGPT admin team if you believe this was a mistake.',
    };
  }, [guardState]);

  if (guardState.status === 'blocked') {
    if (blockedCopy) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
          <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-8 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 text-amber-500" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">{blockedCopy.title}</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{blockedCopy.message}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/main"
                className="inline-flex items-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
              >
                Go to main app
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center rounded-xl bg-primary/10 px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
              >
                Back to login
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  if (isUniversitySuspended) {
    const handleSignOut = async () => {
      await supabase.auth.signOut();
      window.location.replace('/login');
    };
    return <UniversitySuspendedBlocker onLogout={() => void handleSignOut()} />;
  }

  const lecturerProfile = guardState.bootstrap.lecturer_profile;
  const userEmail = guardState.userEmail;
  const userName = [lecturerProfile?.title, lecturerProfile?.full_name].filter(Boolean).join(' ').trim() || 'Lecturer';
  const userInitials = getInitials(lecturerProfile?.full_name || userName);
  const mobileTitle = getLecturerMobileTitle(pathname);
  const isHelpPage = pathname.startsWith('/lecturer/help');
  const isProfilePage = pathname.startsWith('/lecturer/profile');
  const isSearchPage = pathname.startsWith('/lecturer/search');
  const useBackButton = isHelpPage || isProfilePage || isSearchPage;
  const hideMobileNav = isHelpPage || isProfilePage || isSearchPage;
  const hideMobileHeader = isSearchPage;
  const mobileHelpHref = getLecturerHelpHref(pathname);

  const asideClass = sidebarCollapsed
    ? 'fixed left-0 top-0 z-20 hidden h-full flex-col border-r border-border bg-background transition-[width] duration-200 md:flex w-20'
    : 'fixed left-0 top-0 z-20 hidden h-full flex-col border-r border-border bg-background transition-[width] duration-200 md:flex w-64';

  const mainClass = [
    'ml-0 flex flex-1 flex-col scroll-smooth overflow-visible px-4 pt-2 transition-[margin] duration-200 sm:px-5',
    hideMobileNav ? 'pb-0' : 'pb-24',
    'md:h-screen md:overflow-y-auto md:p-8 md:pb-8 md:pt-8',
    sidebarCollapsed ? 'md:ml-20' : 'md:ml-64',
  ].join(' ');

  const mobileHeaderClass = [
    'sticky top-0 z-50 -mx-4 mb-6 min-h-[4.75rem] bg-[#161616] transition-[box-shadow] duration-200 sm:-mx-5 md:hidden',
    mobileHeaderLocked ? 'shadow-[0_8px_24px_rgba(0,0,0,0.35)]' : 'shadow-none',
  ].join(' ');

  const backButtonClass = mobileHeaderLocked
    ? 'flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-foreground'
    : 'flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-background/70 text-foreground';

  const profileButtonClass = mobileHeaderLocked
    ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted'
    : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background/70 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted';

  return (
    <div className="flex min-h-screen bg-muted/20 font-sans text-foreground selection:bg-primary/30">
      <aside className={asideClass}>
        <LecturerSidebarContent
          pathname={pathname}
          userEmail={userEmail}
          userName={userName}
          userInitials={userInitials}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        />
      </aside>

      <main className={mainClass}>
        {hideMobileHeader ? null : (
          <>
            <div ref={mobileHeaderSentinelRef} className="h-3 md:hidden" />
            <div
              data-lecturer-mobile-header="true"
              className={mobileHeaderClass}
            >
              <div className="flex min-h-[4.75rem] items-center px-4 py-3 sm:px-5">
                <div className="flex h-10 w-full items-center justify-between">
                  {useBackButton ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.history.length > 1) {
                          router.back();
                          return;
                        }
                        router.push('/lecturer');
                      }}
                      aria-label="Go back"
                      className={backButtonClass}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  ) : (
                    <Link
                      href={mobileHelpHref}
                      aria-label="Open help guide"
                      className={backButtonClass}
                    >
                      <CircleHelp className="h-4 w-4" />
                    </Link>
                  )}
                  <h1 className="truncate px-3 text-sm font-semibold tracking-wide text-foreground">{mobileTitle}</h1>
                  <Link
                    href="/lecturer/profile"
                    aria-label="Open lecturer profile"
                    className={profileButtonClass}
                  >
                    {userInitials}
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
        {children}
      </main>

      {hideMobileNav ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-2 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-md items-center justify-around gap-2">
            {lecturerMobileNavItems.map((item) => (
              <MobileNavItem key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActivePath(pathname, item.href)} />
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function LecturerSidebarContent({
  pathname,
  userEmail,
  userName,
  userInitials,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  pathname: string;
  userEmail: string | null;
  userName: string;
  userInitials: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const headerClass = collapsed
    ? 'flex h-[73px] items-center border-b border-border justify-center px-3'
    : 'flex h-[73px] items-center border-b border-border justify-between gap-3 px-5';

  const logoWrapClass = collapsed
    ? 'flex min-w-0 items-center justify-center'
    : 'flex min-w-0 items-center gap-3';

  const logoTextClass = collapsed ? 'hidden' : 'block min-w-0';

  const toggleButtonClass = collapsed
    ? 'hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex absolute right-[-1rem] border border-border bg-background shadow-sm'
    : 'hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex';

  const navClass = collapsed
    ? 'flex-1 overflow-y-auto py-5 space-y-3 px-3'
    : 'flex-1 overflow-y-auto py-5 space-y-6 px-3';

  const footerClass = collapsed ? 'border-t border-border p-3' : 'border-t border-border p-4';

  const profileLinkClass = collapsed
    ? 'mb-3 flex items-center rounded-md bg-muted/60 py-2.5 transition-colors hover:bg-muted justify-center px-0'
    : 'mb-3 flex items-center rounded-md bg-muted/60 py-2.5 transition-colors hover:bg-muted gap-3 px-3';

  const profileTextClass = collapsed ? 'hidden' : 'block min-w-0';

  return (
    <div className="flex h-full flex-col">
      <div className={headerClass}>
        <div className={logoWrapClass}>
          <img src="/icon.svg" alt="PansGPT" className="h-8 w-8 shrink-0 object-contain" />
          <div className={logoTextClass}>
            <h1 className="truncate text-sm font-semibold tracking-tight">PansGPT</h1>
            <p className="text-[11px] font-medium uppercase text-muted-foreground">Lecturer Console</p>
          </div>
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={toggleButtonClass}
            aria-label={collapsed ? 'Expand lecturer sidebar' : 'Collapse lecturer sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className={navClass}>
        <div>
          {!collapsed ? <p className="px-3 pb-2 text-[11px] font-semibold uppercase text-muted-foreground">Lecturer</p> : null}
          <div className="space-y-1">
            {lecturerSidebarNavItems.map((item) => (
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
      </nav>

      <div className={footerClass}>
        <Link
          href="/lecturer/profile"
          onClick={onNavigate}
          title={collapsed ? 'Profile' : undefined}
          className={profileLinkClass}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-xs font-semibold text-primary ring-1 ring-border">
            {userInitials}
          </div>
          <div className={profileTextClass}>
            <p className="truncate text-xs font-medium">{userName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{userEmail}</p>
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
  const linkClass = [
    'group relative flex h-10 w-full items-center rounded-md text-sm transition-colors',
    collapsed ? 'justify-center px-0' : 'gap-3 px-3',
    active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ');

  const iconClass = active
    ? 'h-4 w-4 shrink-0 text-primary'
    : 'h-4 w-4 shrink-0 transition-colors group-hover:text-foreground';

  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={linkClass}
    >
      {active ? <span className="absolute left-0 top-2 h-6 w-0.5 rounded-r bg-primary" /> : null}
      <Icon className={iconClass} />
      {!collapsed ? <span className="truncate font-medium">{label}</span> : null}
    </Link>
  );
}

function MobileNavItem({
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
  const linkClass = active
    ? 'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors text-primary'
    : 'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors text-muted-foreground hover:text-foreground';

  return (
    <Link href={href} className={linkClass}>
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === '/lecturer') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(href + '/');
}

function getLecturerMobileTitle(pathname: string) {
  if (pathname === '/lecturer') return 'Home';
  if (pathname.startsWith('/lecturer/restrictions')) return 'Restrictions';
  if (pathname.startsWith('/lecturer/materials')) return 'Materials';
  if (pathname.startsWith('/lecturer/help')) return 'Help';
  if (pathname.startsWith('/lecturer/search')) return 'Search';
  if (pathname.startsWith('/lecturer/profile')) return 'Profile';
  if (pathname.startsWith('/lecturer/pending')) return 'Pending';
  return 'Lecturer';
}

function getLecturerHelpHref(pathname: string) {
  if (pathname === '/lecturer') return '/lecturer/help#overview';
  if (pathname.startsWith('/lecturer/restrictions')) return '/lecturer/help#test-restrictions';
  if (pathname.startsWith('/lecturer/materials')) return '/lecturer/help#material-submissions';
  if (pathname.startsWith('/lecturer/profile')) return '/lecturer/help#account-approval';
  if (pathname.startsWith('/lecturer/pending')) return '/lecturer/help#account-approval';
  return '/lecturer/help#overview';
}

function getInitials(value: string) {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return ((words[0][0] || '') + (words[1][0] || '')).toUpperCase();
  }

  const fallback = value.trim().slice(0, 2).toUpperCase();
  return fallback || 'LC';
}
