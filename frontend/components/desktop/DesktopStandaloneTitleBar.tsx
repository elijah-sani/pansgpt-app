// [DESKTOP UI] Global standalone title bar wrapper for non-desktop shell routes (e.g. /login, /auth/callback)
"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DesktopTitleBar } from "@/components/desktop/DesktopTitleBar";

export function DesktopStandaloneTitleBar() {
  const [isElectron, setIsElectron] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== "undefined" && Boolean((window as any).electronAPI)) {
      setIsElectron(true);
    }
  }, []);

  if (!pathname) return null;

  // Routes handled inside (desktop)/layout.tsx or (app)/layout.tsx already render DesktopTitleBar with tabs
  const isDesktopShellRoute =
    pathname.startsWith("/study") ||
    pathname.startsWith("/main") ||
    pathname.startsWith("/quiz") ||
    pathname.startsWith("/notes") ||
    pathname.startsWith("/reader") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/super-admin") ||
    pathname.startsWith("/lecturer");

  if (!isElectron || isDesktopShellRoute) {
    return null;
  }

  return <DesktopTitleBar minimal />;
}
