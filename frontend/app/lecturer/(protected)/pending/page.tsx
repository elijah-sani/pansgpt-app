'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default function LecturerPendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lecturer access pending</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Your profile is under review. You’ll get access once an admin approves your profile.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/main"
            className="inline-flex items-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            Continue to main app
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
