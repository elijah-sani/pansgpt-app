// [DESKTOP CUSTOM TITLEBAR] Custom frameless title bar component matching Notion tab bar layout
"use client";

import React, { useEffect, useState } from "react";
import { Minus, Square, Copy, X, PanelLeft } from "lucide-react";
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
      className="desktop-custom-titlebar flex h-10 w-full shrink-0 items-center justify-between bg-card/95 border-b border-border/40 px-3 z-40 select-none text-foreground"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Left: Sidebar Toggle, App Title & Document Tabs */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 max-w-[75%]" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            title="Toggle Sidebar"
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-md transition-colors shrink-0"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <PanelLeft size={16} />
          </button>
        )}

        <span
          className="text-xs font-semibold text-foreground tracking-wide shrink-0 border-r border-border/40 pr-2.5"
          style={{ fontFamily: "'Albert Sans', sans-serif", WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          PansGPT
        </span>

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
