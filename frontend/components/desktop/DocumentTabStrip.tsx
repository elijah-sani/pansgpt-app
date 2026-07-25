// [DESKTOP UI] Compact integrated document tab strip (Notion style)
"use client";

import React from "react";
import { X, FileText, Plus } from "lucide-react";
import { useDocumentTabs } from "@/lib/DocumentTabsContext";

export function DocumentTabStrip() {
  const { openTabs, activeTabId, setActiveTabId, closeTab } = useDocumentTabs();

  if (!openTabs || openTabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar select-none h-8 max-w-full">
      {openTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all duration-150 max-w-[180px] shrink-0 cursor-pointer ${
              isActive
                ? "bg-accent/80 text-foreground font-semibold border border-border/50 shadow-2xs"
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40 font-normal border border-transparent"
            }`}
            title={tab.title}
          >
            <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary font-bold" : "text-muted-foreground/70"}`} />
            <span className="truncate flex-1 text-[12px]">{tab.title}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className={`p-0.5 rounded transition-all shrink-0 ${
                isActive
                  ? "opacity-70 hover:opacity-100 hover:bg-background/80 text-foreground"
                  : "opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-accent/80 text-muted-foreground"
              }`}
              title="Close tab"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* Inline "+" New Tab visual affordance */}
      <button
        type="button"
        onClick={() => {
          console.log("[DESKTOP UI] New tab button clicked");
        }}
        className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors ml-0.5"
        title="New tab"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
