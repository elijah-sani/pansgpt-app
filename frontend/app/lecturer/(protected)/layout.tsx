'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  CircleUserRound,
  FileStack,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

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
    university_name?: string | null;
    status?: LecturerStatus | null;
  } | null;
};

type GuardState =
  | { status: 'checking' }
  | { status: 'allowed'; bootstrap: LecturerBootstrap; userEmail: string | null }
  | { status: 'blocked'; bootstrap: LecturerBootstrap };

type LecturerNavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
};

const lecturerNavItems: LecturerNavItem[] = [
  { icon: BookOpenCheck, label: 'Restrictions', href: '/lecturer/restrictions' },
  { icon: FileStack, label: 'Materials', href: '/lecturer/materials' },
];

export default function LecturerProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [guardState, setGuardState] = useState<GuardState>({ status: 'checking' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
        const response = await api.get('/me/bootstrap');
        if (!response.ok) {
          router.replace('/main');
          return;
        }

        const bootstrap = (await response.json()) as LecturerBootstrap;
        const lecturerStatus = bootstrap.lecturer_status;

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
          if (pathname === '/lecturer') {
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

  if (guardState.status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-8 py-10 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Checking lecturer access...</p>
        </div>
      </div>
    );
  }

  if (guardState.status === 'blocked' && blockedCopy) {
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

  const lecturerProfile = guardState.bootstrap.lecturer_profile;
  const userEmail = guardState.userEmail;
  const userName = [lecturerProfile?.title, lecturerProfile?.full_name].filter(Boolean).join(' ').trim() || 'Lecturer';
  const userStatus = guardState.bootstrap.lecturer_status === 'pending' ? 'Pending review' : 'Active lecturer';

  return (
    <div className="flex min-h-screen bg-muted/20 font-sans text-foreground selection:bg-primary/30">
      <aside className={`fixed left-0 top-0 z-20 hidden h-full flex-col border-r border-border bg-background transition-[width] duration-200 md:flex ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <LecturerSidebarContent
          pathname={pathname}
          userEmail={userEmail}
          userName={userName}
          userStatus={userStatus}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        />
      </aside>

      <div className="fixed left-0 right-0 top-0 z-40 flex h-[73px] items-center justify-between bg-muted/20 px-4 md:hidden">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="PansGPT" className="h-6 w-6 object-contain" />
          <span className="text-base font-medium text-foreground" style={{ fontFamily: "'Albert Sans', sans-serif" }}>
            PansGPT Lecturer
          </span>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80 text-foreground">
          <CircleUserRound className="h-5 w-5" />
        </div>
      </div>

      <main className={`ml-0 flex-1 overflow-y-auto px-4 pb-24 pt-20 transition-[margin] duration-200 sm:px-5 md:p-8 md:pb-8 md:pt-8 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around gap-2">
          {lecturerNavItems.map((item) => (
            <MobileNavItem key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActivePath(pathname, item.href)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function LecturerSidebarContent({
  pathname,
  userEmail,
  userName,
  userStatus,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  pathname: string;
  userEmail: string | null;
  userName: string;
  userStatus: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-[73px] items-center border-b border-border ${collapsed ? 'justify-center px-3' : 'justify-between gap-3 px-5'}`}>
        <div className={`flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <img src="/icon.svg" alt="PansGPT" className="h-8 w-8 shrink-0 object-contain" />
          <div className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
            <h1 className="truncate text-sm font-semibold tracking-tight">PansGPT</h1>
            <p className="text-[11px] font-medium uppercase text-muted-foreground">Lecturer Console</p>
          </div>
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex ${collapsed ? 'absolute right-[-1rem] border border-border bg-background shadow-sm' : ''}`}
            aria-label={collapsed ? 'Expand lecturer sidebar' : 'Collapse lecturer sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto py-5 ${collapsed ? 'space-y-3 px-3' : 'space-y-6 px-3'}`}>
        <div>
          {!collapsed ? <p className="px-3 pb-2 text-[11px] font-semibold uppercase text-muted-foreground">Lecturer</p> : null}
          <div className="space-y-1">
            {lecturerNavItems.map((item) => (
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

      <div className={`border-t border-border ${collapsed ? 'p-3' : 'p-4'}`}>
        <div className={`mb-3 flex items-center rounded-md bg-muted/60 py-2.5 ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-xs font-semibold text-primary ring-1 ring-border">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
            <p className="truncate text-xs font-medium">{userName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{userEmail}</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              {userStatus}
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
  return (
    <Link
      href={href}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors ${
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
