'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';
const CRASH_LOOP_STORAGE_KEY = 'pansgpt-crash-loop-state';
const LAST_FRONTEND_ERROR_STORAGE_KEY = 'pansgpt-last-frontend-error';
const CRASH_LOOP_WINDOW_MS = 60_000;
const CRASH_LOOP_THRESHOLD = 3;

export type AppSection = 'student' | 'admin' | 'lecturer' | 'super-admin' | 'public';
export type ErrorScope = 'root' | 'route' | 'widget';

export type FrontendErrorReport = {
  scope: ErrorScope;
  boundary: string;
  pathname: string;
  section: AppSection;
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  digest?: string | null;
  userAgent?: string | null;
  timestamp: string;
};

type CrashLoopState = {
  count: number;
  firstSeenAt: number;
  loopDetected: boolean;
};

export function detectAppSection(pathname: string): AppSection {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/lecturer')) return 'lecturer';
  if (pathname.startsWith('/super-admin')) return 'super-admin';
  if (
    pathname.startsWith('/main') ||
    pathname.startsWith('/reader') ||
    pathname.startsWith('/quiz') ||
    pathname.startsWith('/notes')
  ) {
    return 'student';
  }
  return 'public';
}

export function getSafeHomeRoute(pathname: string): string {
  const section = detectAppSection(pathname);
  switch (section) {
    case 'admin':
      return '/admin';
    case 'lecturer':
      return '/lecturer';
    case 'super-admin':
      return '/super-admin';
    case 'student':
      return '/main';
    default:
      return '/';
  }
}

export function getSectionLabel(section: AppSection): string {
  switch (section) {
    case 'admin':
      return 'Admin';
    case 'lecturer':
      return 'Lecturer';
    case 'super-admin':
      return 'Super Admin';
    case 'student':
      return 'Student';
    default:
      return 'App';
  }
}

function readCrashLoopState(): CrashLoopState {
  if (typeof window === 'undefined') {
    return { count: 0, firstSeenAt: Date.now(), loopDetected: false };
  }

  try {
    const raw = window.sessionStorage.getItem(CRASH_LOOP_STORAGE_KEY);
    if (!raw) {
      return { count: 0, firstSeenAt: Date.now(), loopDetected: false };
    }

    const parsed = JSON.parse(raw) as { count?: number; firstSeenAt?: number };
    const firstSeenAt = Number(parsed.firstSeenAt) || Date.now();
    const count = Number(parsed.count) || 0;

    if (Date.now() - firstSeenAt > CRASH_LOOP_WINDOW_MS) {
      return { count: 0, firstSeenAt: Date.now(), loopDetected: false };
    }

    return {
      count,
      firstSeenAt,
      loopDetected: count >= CRASH_LOOP_THRESHOLD,
    };
  } catch {
    return { count: 0, firstSeenAt: Date.now(), loopDetected: false };
  }
}

export function recordCrashLoop(): CrashLoopState {
  const current = readCrashLoopState();
  const firstSeenAt = current.count === 0 ? Date.now() : current.firstSeenAt;
  const next: CrashLoopState = {
    count: current.count + 1,
    firstSeenAt,
    loopDetected: current.count + 1 >= CRASH_LOOP_THRESHOLD,
  };

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        CRASH_LOOP_STORAGE_KEY,
        JSON.stringify({ count: next.count, firstSeenAt: next.firstSeenAt })
      );
    } catch {
      // ignore storage issues
    }
  }

  return next;
}

export function clearCrashLoopState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CRASH_LOOP_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function reportFrontendError(report: FrontendErrorReport): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(LAST_FRONTEND_ERROR_STORAGE_KEY, JSON.stringify(report));
  } catch {
    // ignore storage issues
  }

  try {
    const response = await fetch(`${API_URL}/sys/frontend-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
      },
      body: JSON.stringify(report),
      keepalive: true,
    });

    if (!response.ok && process.env.NODE_ENV !== 'production') {
      console.warn('[FrontendErrorReporting] Failed to submit frontend error report:', response.status);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[FrontendErrorReporting] Network error while reporting frontend error:', error);
    }
  }
}
