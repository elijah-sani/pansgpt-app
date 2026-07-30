// [DESKTOP CUSTOM TITLEBAR] Custom frameless title bar component matching Notion tab bar layout
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Square, Copy, X } from "lucide-react";
import Logo from "@/components/Logo";
import { DocumentTabStrip } from "@/components/desktop/DocumentTabStrip";
import { useDocumentTabs } from "@/lib/DocumentTabsContext"; // [DESKTOP UI]
import { useChatSession } from "@/lib/ChatSessionContext";

type DesktopTitleBarProps = {
  onOpenSidebar?: () => void;
  minimal?: boolean; // [DESKTOP UI] Standalone window controls mode for login/auth pages
};

export function DesktopTitleBar({ onOpenSidebar, minimal = false }: DesktopTitleBarProps) {
  const router = useRouter();
  const { setActiveTabId } = useDocumentTabs(); // [DESKTOP UI]
  const { setActiveSessionId } = useChatSession();
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isElectron, setIsElectron] = useState<boolean>(false);

  const handleGoHome = () => {
    setActiveTabId?.(null);
    setActiveSessionId(null);
    if (typeof window !== "undefined" && window.location.pathname !== "/study") {
      router.push("/study");
    }
  };

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

  if (minimal) {
    return (
      <header
        className="desktop-custom-titlebar flex h-8 w-full shrink-0 items-center justify-between bg-[#0c0c0d] border-b border-border/30 px-3 z-50 select-none text-foreground"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <Logo className="w-3.5 h-3.5 text-[#2f9e1c] shrink-0" />
          <span
            className="text-xs font-semibold text-foreground tracking-wide"
            style={{ fontFamily: "'Albert Sans', sans-serif" }}
          >
            PansGPT
          </span>
        </div>

        <div className="flex-1 h-full" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />

        {isElectron && (
          <div className="flex items-center gap-1 shrink-0 ml-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <button
              type="button"
              onClick={handleMinimize}
              title="Minimize"
              className="w-7 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/70 rounded-md transition-colors"
            >
              <Minus size={12} />
            </button>
            <button
              type="button"
              onClick={handleMaximize}
              title={isMaximized ? "Restore" : "Maximize"}
              className="w-7 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/70 rounded-md transition-colors"
            >
              {isMaximized ? <Copy size={10} className="rotate-180" /> : <Square size={10} />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              title="Close"
              className="w-7 h-6 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-destructive rounded-md transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </header>
    );
  }

  return (
    <header
      className="desktop-custom-titlebar flex h-10 w-full shrink-0 items-end justify-between bg-[#0c0c0d] border-b border-border/30 px-3 z-40 select-none text-foreground"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Left: Green App Logo Browser-Style Tab Container & Document Tabs */}
      <div className="flex items-end gap-1.5 min-w-0 flex-1 h-full" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        {/* Browser-Style Tab Container matching Image 2 */}
        <div
          onClick={handleGoHome}
          className="flex items-center gap-2 shrink-0 bg-card border-t border-l border-r border-border/50 border-b-0 rounded-t-md rounded-b-none px-3 h-[32px] shadow-2xs cursor-pointer hover:bg-card/90 transition-all"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title="Go to Desktop Home Page"
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
        <div className="flex-1 min-w-0 flex items-end h-full">
          <DocumentTabStrip />
        </div>
      </div>

      {/* Right: Custom Window Controls (Electron only, or fallback for desktop) */}
      {isElectron && (
        <div className="flex items-center self-center gap-1 shrink-0 ml-2 mb-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
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
