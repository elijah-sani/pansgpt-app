'use client';

import { Building2, LogOut } from 'lucide-react';
import { buildWhatsAppSupportUrl } from '@/lib/support-config';

const SUSPENDED_SUPPORT_MESSAGE =
  'Hello, my university workspace is temporarily unavailable on PANSGPT. Please assist me.';

type Props = {
  onLogout: () => void;
};

/**
 * Full-screen blocker shown to students, lecturers, and university admins
 * when their assigned university has been suspended.
 *
 * Does not allow any workspace access.
 * Provides a direct WhatsApp support link using the shared support number.
 */
export default function UniversitySuspendedBlocker({ onLogout }: Props) {
  const whatsappUrl = buildWhatsAppSupportUrl(SUSPENDED_SUPPORT_MESSAGE);

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-6 py-12">
      <main className="w-full max-w-lg text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
          <Building2 className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>

        <h1 className="mt-6 text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          University workspace temporarily unavailable
        </h1>

        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
          Your university workspace is temporarily unavailable. Please contact your university admin for assistance.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
          >
            Contact PANSGPT Support
          </a>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted sm:w-auto"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </main>
    </div>
  );
}
