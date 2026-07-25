// [DESKTOP CUSTOM TITLEBAR] Custom frameless title bar component matching Notion tab bar layout
"use client";

import React, { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import Logo from "@/components/Logo";
import { DocumentTabStrip } from "@/components/desktop/DocumentTabStrip";

type DesktopTitleBarProps = {
  onOpenSidebar?: () => void;
};

export function DesktopTitleBar({ onOpenSidebar }: DesktopTitleBarProps) {
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isElectron, setIsElectron] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined" && Boolean((window as any).electronAPI)) {
      setIsElectron(true);
      const api = (window as any).electronAPI;
      if (api.isMaximized) {
        api.isMaximized().then((maximized: boolean) => setIsMaximized(Boolean(maximized)));
      }
      if (api.onMaximizedChange) {
        const unsubscribe = api.onMaximizedChange((maximized: boolean) => {
          setIsMaximized(Boolean(maximized));
        });
        return () => {
          if (typeof unsubscribe === "function") unsubscribe();
        };
      }
    }
  }, []);

  const handleMinimize = () => {
    if (typeof window !== "undefined" && (window as any).electronAPI?.minimizeWindow) {
      (window as any).electronAPI.minimizeWindow();
    }
  };

  const handleMaximize = () => {
    if (typeof window !== "undefined" && (window as any).electronAPI?.maximizeWindow) {
      (window as any).electronAPI.maximizeWindow().then((maximized: boolean) => {
        setIsMaximized(Boolean(maximized));
      });
    }
  };

  const handleClose = () => {
    if (typeof window !== "undefined" && (window as any).electronAPI?.closeWindow) {
      (window as any).electronAPI.closeWindow();
    }
  };

  return (
    <header
      className="desktop-custom-titlebar flex h-10 w-full shrink-0 items-center justify-between bg-[#0e0e0e] border-b border-border/30 px-3 z-40 select-none text-foreground"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Left: Green App Logo Pill Container, PansGPT Title & Document Tabs */}
      <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[75%]" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        {/* Lighter Brand Pill Container matching WPS reference image */}
        <div
          className="flex items-center gap-1.5 shrink-0 bg-card border border-border/50 rounded-md px-2.5 py-1 shadow-2xs"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Logo className="w-3.5 h-3.5 text-[#2f9e1c] shrink-0" />
          <span
            className="text-xs font-semibold text-foreground tracking-wide"
            style={{ fontFamily: "'Albert Sans', sans-serif" }}
          >
            PansGPT
          </span>
        </div>

        {/* Integrated Document Tab Strip */}
        <div className="flex-1 min-w-0 flex items-center" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <DocumentTabStrip />
        </div>
      </div>

      {/* Center/Middle Empty Drag Spacer */}
      <div className="flex-1 h-full min-w-[20px]" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />

      {/* Right: Custom Window Controls (Electron only, or fallback for desktop) */}
      {isElectron && (
        <div className="flex items-center gap-1 shrink-0 ml-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          {/* Minimize Button */}
          <button
            type="button"
            onClick={handleMinimize}
            title="Minimize"
            className="w-8 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/70 rounded-md transition-colors"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <Minus size={13} />
          </button>

          {/* Maximize / Restore Button */}
          <button
            type="button"
            onClick={handleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
            className="w-8 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/70 rounded-md transition-colors"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {isMaximized ? <Copy size={11} className="rotate-180" /> : <Square size={11} />}
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={handleClose}
            title="Close"
            className="w-8 h-7 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-destructive rounded-md transition-colors"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </header>
  );
}
