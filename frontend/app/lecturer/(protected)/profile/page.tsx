'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2, LogOut, Mail, Phone } from 'lucide-react';

import { fetchBootstrap } from '@/lib/bootstrap-cache';
import { supabase } from '@/lib/supabase';

type LecturerStatus = 'pending' | 'active' | 'rejected' | 'suspended' | 'revoked';

type LecturerProfile = {
  title?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  university_name?: string | null;
  status?: LecturerStatus | null;
};

type LecturerBootstrap = {
  lecturer_status?: LecturerStatus | null;
  lecturer_profile?: LecturerProfile | null;
};

const STATUS_LABELS: Record<LecturerStatus, string> = {
  active: 'Active',
  pending: 'Pending review',
  rejected: 'Rejected',
  suspended: 'Suspended',
  revoked: 'Revoked',
};

const STATUS_CLASSES: Record<LecturerStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-500',
  pending: 'bg-amber-500/10 text-amber-500',
  rejected: 'bg-rose-500/10 text-rose-500',
  suspended: 'bg-orange-500/10 text-orange-500',
  revoked: 'bg-slate-500/10 text-slate-400',
};

export default function LecturerProfilePage() {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<LecturerBootstrap | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const payload = await fetchBootstrap();
      if (!active || !payload) {
        return;
      }
      setBootstrap(payload as LecturerBootstrap);
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const profile = bootstrap?.lecturer_profile;
  const lecturerStatus = bootstrap?.lecturer_status ?? profile?.status ?? 'pending';
  const name = profile?.full_name?.trim() || 'Lecturer profile';
  const title = profile?.title?.trim() || null;
  const displayName = title ? `${title} ${name}` : name;
  const email = profile?.email?.trim() || 'Not available';
  const phoneNumber = profile?.phone_number?.trim() || 'Not provided';
  const university = profile?.university_name?.trim() || 'Not available';
  const statusLabel = STATUS_LABELS[lecturerStatus];
  const statusClass = STATUS_CLASSES[lecturerStatus];
  const initials = useMemo(() => getInitials(name), [name]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.replace('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col pb-0 md:px-0 md:pb-12">
      <div className="flex flex-1 flex-col gap-6 md:block">
        <header className="hidden space-y-1.5 px-4 pb-3 sm:px-5 md:block md:px-0">
          <h1 className="text-xl font-bold text-foreground md:text-3xl">Profile</h1>
          <p className="text-sm text-muted-foreground md:text-base">Manage your lecturer account details.</p>
        </header>

        <div className="flex flex-1 flex-col md:hidden">
            <section className="space-y-4 px-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-[1.5rem] bg-primary/10 text-lg font-semibold text-primary ring-1 ring-primary/15">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Lecturer account</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{displayName}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Approved lecturer profile</p>
                </div>
              </div>

              <span className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass}`}>
                {statusLabel}
              </span>
            </section>

            <section className="mt-5 -mx-4 flex-1 bg-[#0b0b0b] pt-6 sm:-mx-5">
              <div className="flex h-full flex-col px-8 pb-6 sm:px-10">
              <dl className="divide-y divide-white/10">
                <MobileProfileRow label="Email" value={email} icon={Mail} />
                <MobileProfileRow label="Phone number" value={phoneNumber} icon={Phone} />
                <MobileProfileRow label="University" value={university} icon={Building2} />
              </dl>

              <div className="mt-6 border-t border-white/10 pt-6">
                <div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">Account note</h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      To update your lecturer details, contact PansGPT admin.
                    </p>
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">
                      Your lecturer profile reflects the current university access already approved for this account.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-6">
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={isLoggingOut}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-white/[0.06] disabled:opacity-60"
                >
                  {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  {isLoggingOut ? 'Logging out...' : 'Logout'}
                </button>
              </div>
              </div>
            </section>
        </div>

        <div className="hidden gap-5 px-4 sm:px-5 md:grid md:px-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)] lg:items-start">
          <section className="overflow-hidden rounded-3xl border border-border bg-background/90">
            <div className="border-b border-border/70 bg-muted/25 px-6 py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary ring-1 ring-primary/15">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Lecturer account</p>
                    <h2 className="truncate text-lg font-semibold text-foreground sm:text-2xl">{displayName}</h2>
                  </div>
                </div>

                <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>
                  {statusLabel}
                </span>
              </div>
            </div>

            <div className="px-6 py-6">
              <dl className="divide-y divide-border/60">
                <DesktopProfileRow label="Email" value={email} icon={Mail} />
                <DesktopProfileRow label="Phone number" value={phoneNumber} icon={Phone} />
                <DesktopProfileRow label="University" value={university} icon={Building2} />
              </dl>
            </div>
          </section>

          <aside className="rounded-3xl border border-border bg-background/90 p-6">
            <div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground sm:text-base">Account note</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  To update your lecturer details, contact PansGPT admin.
                </p>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Your lecturer profile reflects the current university access already approved for this account.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <div className="hidden pt-2 md:block">
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60 sm:w-auto"
          >
            {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileProfileRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-muted-foreground ring-1 ring-white/10">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-sm font-medium leading-6 text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DesktopProfileRow({
  label,
  value,
  icon: Icon,
  valueClassName,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground ring-1 ring-border/70">
          <Icon className="h-4 w-4" />
        </span>
        <span>{label}</span>
      </dt>
      <dd className={`min-w-0 break-words pl-12 text-sm font-medium ${valueClassName || 'text-foreground'} sm:max-w-[62%] sm:pl-0 sm:text-right`}>
        {value}
      </dd>
    </div>
  );
}

function getInitials(value: string) {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }

  return value.trim().slice(0, 2).toUpperCase() || 'LC';
}
