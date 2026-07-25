// [DESKTOP UI SECURITY]
"use client";

import React from "react";
import { Clock3, ShieldAlert } from "lucide-react";
import type { ActiveRestriction } from "@/hooks/useStudentRestrictions";
import { buildWhatsAppSupportUrl } from "@/lib/support-config";

export function StudentRestrictionBlocker({
  restriction,
  now,
}: {
  restriction: ActiveRestriction;
  now: number;
}) {
  const courseLabel = restriction.course_code || restriction.course_title || restriction.title || "Current assessment";
  const lecturerName = [restriction.lecturer_title, restriction.lecturer_full_name].filter(Boolean).join(" ").trim() || "Your lecturer";
  const whatsappMessage = [
    "Hello PansGPT Admin, I think this restriction may be wrong or my test has ended.",
    "",
    `Course: ${courseLabel}`,
    `Level: ${restriction.level || "Not specified"}`,
    `Lecturer: ${lecturerName}`,
    `Restriction ends: ${formatRestrictionDateTime(restriction.end_time)}`,
  ].join("\n");
  const whatsappSupportUrl = buildWhatsAppSupportUrl(whatsappMessage);

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-6 py-12">
      <main className="w-full max-w-2xl text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border text-primary">
          <ShieldAlert className="h-5 w-5" />
        </div>

        <h1 className="mt-5 text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          PansGPT is temporarily paused for your level.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Access will return automatically when this restriction ends.
        </p>

        <section className="mx-auto mt-8 max-w-sm border-y border-border py-6">
          <div className="flex items-center justify-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <Clock3 className="h-4 w-4" />
            Time remaining
          </div>
          <p className="mt-3 text-4xl font-semibold text-foreground sm:text-5xl">
            {formatRestrictionCountdown(restriction.end_time, now)}
          </p>
        </section>

        <dl className="mx-auto mt-8 max-w-xl divide-y divide-border text-left">
          <RestrictionDetail label="Course" value={courseLabel} />
          <RestrictionDetail label="Lecturer" value={lecturerName} />
          <RestrictionDetail label="Message" value={restriction.reason || "Your lecturer has temporarily paused access during this assessment."} />
          <RestrictionDetail label="Ends at" value={formatRestrictionDateTime(restriction.end_time)} />
        </dl>

        <div className="mx-auto mt-8 max-w-md text-sm leading-6 text-muted-foreground">
          <p>If your test has ended or this restriction seems wrong, contact admin.</p>
          <a
            href={whatsappSupportUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Contact admin
          </a>
        </div>
      </main>
    </div>
  );
}

function RestrictionDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[8rem_1fr] sm:gap-6">
      <dt className="text-xs font-semibold uppercase text-muted-foreground">{label}</dt>
      <dd className="text-sm leading-6 text-foreground">{value}</dd>
    </div>
  );
}

function formatRestrictionCountdown(value: string | null | undefined, now: number) {
  if (!value) {
    return "—";
  }

  const endTime = new Date(value).getTime();
  if (Number.isNaN(endTime)) {
    return value;
  }

  const remaining = Math.max(endTime - now, 0);
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatRestrictionDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}
